package app.gagachat.core.data.repository

import android.content.Context
import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.IdGenerator
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.database.dao.MessageDao
import app.gagachat.core.database.dao.UploadDao
import app.gagachat.core.database.entity.PendingUploadEntity
import app.gagachat.core.database.mapper.toEntity
import app.gagachat.core.model.Message
import app.gagachat.core.network.session.SessionStore
import app.gagachat.core.network.storage.SupabaseStorageApi
import app.gagachat.sync.outbox.OutboxScheduler
import io.mockk.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class MediaQueueRegressionTest {
    private class Fixture(scope: CoroutineScope, dispatcher: CoroutineDispatcher) {
        val messages = mockk<MessageDao>(relaxed = true)
        val uploads = mockk<UploadDao>(relaxed = true)
        val storage = mockk<SupabaseStorageApi>()
        val delivery = mockk<MessageRepository>(relaxed = true)
        val session = mockk<SessionStore>()
        val rows = linkedMapOf<String, PendingUploadEntity>()
        var message = Message(localId = "album", clientMessageId = "album", conversationId = "chat", senderId = "me").toEntity()
        val repository: DefaultMediaRepository
        init {
            every { session.userId() } returns "me"
            coEvery { uploads.getQueued() } answers { rows.values.filter { it.state != "FAILED" } }
            coEvery { uploads.getForMessage("album") } answers { rows.values.toList() }
            coEvery { messages.getByClientMessageId("album") } answers { message }
            coEvery { uploads.updateState(any(), any(), any(), any(), any()) } answers {
                val id = firstArg<String>(); val old = rows.getValue(id)
                rows[id] = old.copy(state = secondArg(), attempts = thirdArg(),
                    remoteUrl = arg<String?>(3) ?: old.remoteUrl, thumbnailUrl = arg<String?>(4) ?: old.thumbnailUrl)
            }
            coEvery { uploads.delete(any()) } answers { rows.remove(firstArg<String>()); Unit }
            coEvery { uploads.resetForRetry("album") } answers {
                rows.replaceAll { _, row -> row.copy(state = if (row.remoteUrl == null) "QUEUED" else "UPLOADED", attempts = 0) }
            }
            every { storage.objectPath(any(), any(), any()) } answers { "${firstArg<String>()}/${secondArg<String>()}.jpg" }
            val dispatchers = object : DispatcherProvider {
                override val main = dispatcher; override val io = dispatcher
                override val default = dispatcher; override val computation = dispatcher
            }
            repository = DefaultMediaRepository(mockk<Context>(), messages, uploads, storage, session, delivery,
                mockk<IdGenerator>(), mockk<TimeProvider>(), dispatchers, mockk<OutboxScheduler>(relaxed = true), scope)
        }
        fun add(id: String, path: String, state: String = "QUEUED", url: String? = null) {
            rows[id] = PendingUploadEntity(id, "album", "chat", path, "image/jpeg", 3L, "IMAGE", 0, 0, url, null, state)
        }
    }

    @Test fun failedPhotoCannotDisappearFromAnAlbum() = runTest {
        val f = Fixture(backgroundScope, StandardTestDispatcher(testScheduler))
        f.add("first", "unused", "UPLOADED", "https://media/first")
        f.add("second", "missing", "FAILED")
        f.repository.processQueue()
        coVerify(exactly = 0) { f.delivery.retry(any()) }
        coVerify(exactly = 0) { f.messages.updateMediaAlbum(any(), any(), any()) }
        assertEquals(2, f.rows.size)
    }

    @Test fun manualRetryKeepsUploadedPhotoAndSendsCompleteAlbumInOrder() = runTest {
        val f = Fixture(backgroundScope, StandardTestDispatcher(testScheduler))
        val file = File.createTempFile("gaga-photo", ".jpg").apply { writeBytes(byteArrayOf(1, 2, 3)) }
        try {
            f.add("first", "already-uploaded", "UPLOADED", "https://media/first")
            f.add("second", file.path, "FAILED")
            coEvery { f.storage.uploadFile(any(), any(), any(), any()) } returns "https://media/second"
            coEvery { f.delivery.retry("album") } returns AppResult.Success(Unit)
            assertTrue(f.repository.retryUpload("album") is AppResult.Success)
            f.repository.processQueue()
            coVerify(exactly = 1) { f.storage.uploadFile("me/second.jpg", any(), "image/jpeg", any()) }
            coVerify { f.messages.updateMediaAlbum("album", "https://media/first", "[\"https://media/first\",\"https://media/second\"]") }
            coVerify(exactly = 1) { f.delivery.retry("album") }
            assertTrue(f.rows.isEmpty())
        } finally { file.delete() }
    }

    @Test fun switchingAccountsCannotUploadOrDispatchPreviousUsersWork() = runTest {
        val f = Fixture(backgroundScope, StandardTestDispatcher(testScheduler))
        f.add("first", "unused")
        every { f.session.userId() } returns "other-user"
        f.repository.processQueue()
        assertTrue(f.repository.retryUpload("album") is AppResult.Failure)
        coVerify(exactly = 0) { f.storage.uploadFile(any(), any(), any(), any()) }
        coVerify(exactly = 0) { f.delivery.retry(any()) }
        assertEquals(1, f.rows.size)
    }

    @Test fun failedMessageDeliveryRetainsUploadedRowsForRetry() = runTest {
        val f = Fixture(backgroundScope, StandardTestDispatcher(testScheduler))
        f.add("first", "unused", "UPLOADED", "https://media/first")
        coEvery { f.delivery.retry("album") } returns AppResult.Failure(app.gagachat.core.common.result.AppError.Network())
        try { f.repository.processQueue(); fail("Worker must retry") } catch (_: IOException) { }
        assertEquals("https://media/first", f.rows.getValue("first").remoteUrl)
        coEvery { f.delivery.retry("album") } returns AppResult.Success(Unit)
        f.repository.processQueue()
        coVerify(exactly = 0) { f.storage.uploadFile(any(), any(), any(), any()) }
        assertTrue(f.rows.isEmpty())
    }
}
