package app.gagachat.core.data.repository

import app.gagachat.core.data.mapper.toDomain
import app.gagachat.core.database.dao.MessageDao
import app.gagachat.core.model.Message
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.coroutines.CancellationException
import javax.inject.Inject

data class AttachmentPage(val messages: List<Message>, val nextOffset: Int, val hasMore: Boolean)

/** Search results are never written over local messages or their delete-for-me flags. */
class AttachmentSearchRepository @Inject constructor(
    private val api: SupabaseRestApi,
    private val dao: MessageDao,
    private val auth: AuthRepository,
) {
    suspend fun search(query: String, offset: Int = 0): AttachmentPage {
        val owner = auth.sessionFlow.value?.userId ?: throw CancellationException("Signed out")
        val rows = api.searchAttachments(query, offset, PAGE_SIZE)
        val messages = rows.mapNotNull { row ->
            val local = dao.getByServerMessageId(row.id)
                ?: row.clientMessageId?.let { dao.getByClientMessageId(it) }
            if (local?.hiddenForMe == true || local?.deletedAt != null) null else row.toDomain()
        }
        if (auth.sessionFlow.value?.userId != owner) throw CancellationException("Account changed")
        return AttachmentPage(messages, offset + rows.size, rows.size == PAGE_SIZE)
    }

    companion object { const val PAGE_SIZE = 40 }
}
