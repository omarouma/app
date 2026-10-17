package app.gagachat.core.data.repository

import app.gagachat.core.database.dao.MessageDao
import app.gagachat.core.database.entity.MessageEntity
import app.gagachat.core.network.dto.MessageRow
import app.gagachat.core.network.rest.SupabaseRestApi
import app.gagachat.core.network.session.AuthSession
import io.mockk.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class AttachmentSearchRepositoryTest {
    private val api = mockk<SupabaseRestApi>()
    private val dao = mockk<MessageDao>(relaxed = true)
    private val auth = mockk<AuthRepository>()
    private val session = MutableStateFlow<AuthSession?>(AuthSession("alice", "token", "refresh", Long.MAX_VALUE))
    private fun repository(): AttachmentSearchRepository {
        every { auth.sessionFlow } returns session
        return AttachmentSearchRepository(api, dao, auth)
    }

    @Test fun hiddenResultsDoNotReappearAndDoNotBreakPagination() = runTest {
        val rows = (0 until 40).map { MessageRow("$it", conversationId = "chat", senderId = "peer", type = "file", mediaUrl = "private") }
        coEvery { api.searchAttachments("", 0, 40) } returns rows
        coEvery { dao.getByServerMessageId(any()) } returns null
        val hidden = mockk<MessageEntity> {
            every { hiddenForMe } returns true
            every { deletedAt } returns null
        }
        coEvery { dao.getByServerMessageId("0") } returns hidden
        val page = repository().search("")
        assertEquals(39, page.messages.size)
        assertEquals(40, page.nextOffset)
        assertTrue(page.hasMore)
        coVerify(exactly = 0) { dao.upsertAll(any()) }
    }

    @Test fun accountSwitchDuringRequestDiscardsTheResponse() = runTest {
        coEvery { api.searchAttachments("", 0, 40) } coAnswers {
            session.value = AuthSession("bob", "other", "refresh", Long.MAX_VALUE)
            listOf(MessageRow("1", conversationId = "alice-private", senderId = "peer"))
        }
        val result = runCatching { repository().search("") }
        assertTrue(result.exceptionOrNull() is CancellationException)
    }
}
