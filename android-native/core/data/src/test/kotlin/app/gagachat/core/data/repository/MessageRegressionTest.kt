package app.gagachat.core.data.repository

import app.gagachat.core.common.Constants
import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.IdGenerator
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.database.dao.*
import app.gagachat.core.database.entity.*
import app.gagachat.core.database.mapper.toEntity
import app.gagachat.core.firebase.FirestoreChatMirror
import app.gagachat.core.model.*
import app.gagachat.core.network.dto.MessageRow
import app.gagachat.core.network.rest.SupabaseRestApi
import app.gagachat.sync.outbox.OutboxScheduler
import io.mockk.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MessageRegressionTest {
    private val messages = mockk<MessageDao>(relaxed = true)
    private val conversations = mockk<ConversationDao>(relaxed = true)
    private val cursors = mockk<SyncStateDao>(relaxed = true)
    private val api = mockk<SupabaseRestApi>()
    private val scheduler = mockk<OutboxScheduler>(relaxed = true)
    private val ids = mockk<IdGenerator>()
    private val clock = mockk<TimeProvider>()
    private val firebaseMirror = mockk<FirestoreChatMirror>(relaxed = true)
    private val privacy = mockk<app.gagachat.core.data.preferences.SettingsPreferences>()
    private val appScope = CoroutineScope(Dispatchers.Unconfined)
    private fun repo(dispatcher: CoroutineDispatcher): DefaultMessageRepository {
        every { clock.nowMillis() } returns 999999L
        every { ids.newClientMessageId() } returns "local"
        val dispatchers = object : DispatcherProvider {
            override val main = dispatcher
            override val io = dispatcher
            override val default = dispatcher
            override val computation = dispatcher
        }
        return DefaultMessageRepository(
            messages, conversations, cursors, api, scheduler, ids, clock, dispatchers,
            firebaseMirror, appScope, privacy,
        )
    }

    @Test fun disabledReceiptsDoNotReachAnyNetworkRoute() = runTest {
        every { privacy.accountPrivacy } returns kotlinx.coroutines.flow.flowOf(AccountPrivacy(readReceipts = false))
        repo(StandardTestDispatcher(testScheduler)).markRead("chat", "me")
        coVerify(exactly = 0) { api.upsertChatRead(any()) }
        coVerify(exactly = 0) { api.updateMessageDelivery(any(), any(), any(), any()) }
        coVerify { conversations.updateUnreadCount("chat", 0) }
    }
    @Test fun disabledTypingIsNotMirroredToFirebase() = runTest {
        every { privacy.accountPrivacy } returns kotlinx.coroutines.flow.flowOf(AccountPrivacy(typingIndicator = false))
        repo(StandardTestDispatcher(testScheduler)).setTyping("chat", "me", true)
        coVerify(exactly = 0) { api.upsertTyping(any(), any(), any()) }
        coVerify(exactly = 0) { firebaseMirror.mirrorTyping(any(), any(), any()) }
    }

    @Test fun nullLocalIdsRemainDistinctAndReadStatusSurvives() = runTest {
        val repo = repo(StandardTestDispatcher(testScheduler))
        coEvery { messages.getByServerMessageId(any()) } returns null
        coEvery { messages.getByClientMessageId(any()) } returns null
        val saved = mutableListOf<MessageEntity>()
        coEvery { messages.upsert(capture(saved)) } just Runs
        for (id in listOf("server1", "server2")) {
            repo.applyRealtimeInsert(Json.parseToJsonElement("""{"id":"$id","local_id":null,"chat_id":"chat","sender_id":"peer","content":null,"delivery_status":"read","created_at":"2026-09-30T00:00:00Z"}""").jsonObject)
        }
        assertEquals(listOf("server1", "server2"), saved.map { it.localId })
        assertTrue(saved.all { it.text == null && it.status == "READ" })
    }

    @Test fun catchUpDrainsPagesAndUsesServerTime() = runTest {
        val repo = repo(StandardTestDispatcher(testScheduler))
        coEvery { cursors.get(any()) } returns SyncStateEntity("messages:chat", 100L, null)
        coEvery { messages.getByServerMessageId(any()) } returns null
        coEvery { messages.getByClientMessageId(any()) } returns null
        val page = (0 until Constants.MESSAGE_PAGE_SIZE).map { MessageRow("s$it", conversationId="chat", senderId="peer", createdAt=200L) }
        coEvery { api.getMessagesSince("chat", 100L, Constants.MESSAGE_PAGE_SIZE, 0) } returns page
        coEvery { api.getMessagesSince("chat", 100L, Constants.MESSAGE_PAGE_SIZE, page.size) } returns listOf(MessageRow("last", conversationId="chat", senderId="peer", createdAt=300L))
        assertTrue(repo.syncNewMessages("chat") is AppResult.Success)
        coVerify { cursors.upsert(match { it.lastSyncedAt == 300L }) }
        coVerify(exactly=Constants.MESSAGE_PAGE_SIZE + 1) { messages.upsert(any()) }
    }

    @Test fun simultaneousOutboxRetriesInsertOnlyOnce() = runTest {
        val repo = repo(StandardTestDispatcher(testScheduler))
        var cached = Message(localId="local", clientMessageId="local", conversationId="chat", senderId="me", text="hello").toEntity()
        coEvery { messages.getByLocalId("local") } answers { cached }
        coEvery { messages.updateStatus(any(), any(), any(), any()) } coAnswers {
            cached = cached.copy(status=secondArg(), serverMessageId=arg<String?>(2) ?: cached.serverMessageId)
        }
        coEvery { api.insertMessage(any()) } coAnswers {
            delay(50)
            MessageRow("server", clientMessageId="local", conversationId="chat", senderId="me", createdAt=100L)
        }
        coroutineScope { listOf(async { repo.retry("local") }, async { repo.retry("local") }).awaitAll() }
        coVerify(exactly=1) { api.insertMessage(any()) }
        assertEquals("server", cached.serverMessageId)
    }

    @Test fun cancellationIsNotConvertedIntoFailedMessage() = runTest {
        val repo = repo(StandardTestDispatcher(testScheduler))
        coEvery { messages.getByLocalId(any()) } returns Message(localId="local", clientMessageId="local", conversationId="chat", senderId="me").toEntity()
        coEvery { api.insertMessage(any()) } throws CancellationException("stop")
        try { repo.retry("local"); fail("Expected cancellation") } catch (_: CancellationException) { }
        coVerify(exactly=0) { messages.updateStatus(any(), "FAILED", any(), any()) }
    }
}
