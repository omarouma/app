package app.gagachat.core.data.repository

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.database.dao.ContactPhotoOverrideDao
import app.gagachat.core.database.entity.ContactPhotoOverrideEntity
import app.gagachat.core.network.session.AuthSession
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import java.io.ByteArrayInputStream
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ContactPhotoOverridesRepositoryTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val context = mockk<Context>()
    private val resolver = mockk<ContentResolver>()
    private val dao = mockk<ContactPhotoOverrideDao>(relaxed = true)
    private val auth = mockk<AuthRepository>()
    private val dispatchers = object : DispatcherProvider {
        override val main = Dispatchers.Unconfined
        override val io = Dispatchers.Unconfined
        override val default = Dispatchers.Unconfined
        override val computation = Dispatchers.Unconfined
    }

    private val signedIn = AuthSession("owner-1", "token", "refresh", Long.MAX_VALUE)

    private fun repository(session: AuthSession?): DefaultContactPhotoOverridesRepository {
        every { auth.sessionFlow } returns MutableStateFlow(session)
        every { context.filesDir } returns tmp.root
        every { context.contentResolver } returns resolver
        return DefaultContactPhotoOverridesRepository(context, dao, auth, dispatchers)
    }

    @Test
    fun observeReturnsEmptyWhenSignedOut() = runTest {
        val repo = repository(null)
        assertTrue(repo.observeOverrides().first().isEmpty())
    }

    @Test
    fun observeMapsRowsForTheCurrentOwnerKeyedByContact() = runTest {
        every { dao.observeByOwner("owner-1") } returns flowOf(
            listOf(ContactPhotoOverrideEntity("owner-1", "c-1", "/tmp/a.jpg", 100L)),
        )
        val overrides = repository(signedIn).observeOverrides().first()
        assertEquals(1, overrides.size)
        assertEquals("/tmp/a.jpg", overrides["c-1"]?.localPath)
    }

    @Test
    fun setOverrideCopiesIntoPrivateStorageAndScopesToOwner() = runTest {
        every { resolver.getType(any()) } returns "image/png"
        every { resolver.openInputStream(any()) } returns ByteArrayInputStream("hello".toByteArray())
        val captured = slot<ContactPhotoOverrideEntity>()
        coEvery { dao.upsert(capture(captured)) } returns Unit

        val ok = repository(signedIn).setOverride("c-1", mockk<Uri>())

        assertTrue(ok)
        assertEquals("owner-1", captured.captured.ownerId)
        assertEquals("c-1", captured.captured.contactId)
        val file = File(captured.captured.localPath)
        assertTrue(file.exists())
        assertEquals("hello", file.readText())
        assertTrue(file.absolutePath.contains("contact_photos/owner-1"))
    }

    @Test
    fun setOverrideIsNoOpWhenSignedOut() = runTest {
        val ok = repository(null).setOverride("c-1", mockk<Uri>())
        assertFalse(ok)
        coVerify(exactly = 0) { dao.upsert(any()) }
    }

    @Test
    fun setOverrideReturnsFalseWhenSourceCannotBeRead() = runTest {
        every { resolver.getType(any()) } returns "image/jpeg"
        every { resolver.openInputStream(any()) } returns null
        val ok = repository(signedIn).setOverride("c-1", mockk<Uri>())
        assertFalse(ok)
        coVerify(exactly = 0) { dao.upsert(any()) }
    }

    @Test
    fun clearOverrideDeletesRowAndPrivateFile() = runTest {
        val dir = File(tmp.root, "contact_photos/owner-1").apply { mkdirs() }
        val file = File(dir, "c-1.jpg").apply { writeText("x") }
        coEvery { dao.getByOwner("owner-1") } returns listOf(
            ContactPhotoOverrideEntity("owner-1", "c-1", file.absolutePath, 1L),
        )

        repository(signedIn).clearOverride("c-1")

        coVerify { dao.delete("owner-1", "c-1") }
        assertFalse(file.exists())
    }

    @Test
    fun clearOverrideIsNoOpWhenSignedOut() = runTest {
        repository(null).clearOverride("c-1")
        coVerify(exactly = 0) { dao.delete(any(), any()) }
    }
}
