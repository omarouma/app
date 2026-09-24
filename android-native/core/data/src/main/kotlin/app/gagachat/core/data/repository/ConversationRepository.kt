package app.gagachat.core.data.repository

import app.gagachat.core.common.Constants
import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.data.mapper.toDomain
import app.gagachat.core.data.sync.SyncPolicy
import app.gagachat.core.database.dao.ConversationDao
import app.gagachat.core.database.dao.SyncStateDao
import app.gagachat.core.database.entity.SyncStateEntity
import app.gagachat.core.database.mapper.toDomain
import app.gagachat.core.database.mapper.toEntity
import app.gagachat.core.model.Conversation
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Conversation list access (PDF §4.1 — cached list renders instantly, realtime
 * delta sync updates only changed rows).
 */
interface ConversationRepository {
    fun observeConversations(): Flow<List<Conversation>>
    fun observeConversation(id: String): Flow<Conversation?>
    suspend fun syncConversations(): AppResult<Unit>
    suspend fun markRead(conversationId: String, messageId: String)
    suspend fun setPinned(conversationId: String, pinned: Boolean)
    suspend fun setMuted(conversationId: String, muted: Boolean)
}

@Singleton
class DefaultConversationRepository @Inject constructor(
    private val conversationDao: ConversationDao,
    private val syncStateDao: SyncStateDao,
    private val restApi: SupabaseRestApi,
    private val timeProvider: TimeProvider,
    private val dispatchers: DispatcherProvider,
) : ConversationRepository {

    override fun observeConversations(): Flow<List<Conversation>> =
        conversationDao.observeAll().map { entities ->
            entities.map { entity ->
                val members = conversationDao.getMembers(entity.id).map { it.toDomain() }
                entity.toDomain(members)
            }
        }

    override fun observeConversation(id: String): Flow<Conversation?> =
        conversationDao.observeById(id).map { entity ->
            entity?.let {
                val members = conversationDao.getMembers(it.id).map { m -> m.toDomain() }
                it.toDomain(members)
            }
        }

    override suspend fun syncConversations(): AppResult<Unit> = withContext(dispatchers.io) {
        try {
            val cursor = syncStateDao.get(KEY)?.lastSyncedAt
            val rows = if (cursor == null) {
                restApi.getConversations(Constants.CONVERSATION_PAGE_SIZE, 0)
            } else {
                restApi.getConversationsUpdatedSince(cursor, Constants.CONVERSATION_PAGE_SIZE)
            }
            val now = timeProvider.nowMillis()
            conversationDao.upsertAll(rows.map { it.toDomain().toEntity(now) })

            val ids = rows.map { it.id }
            if (ids.isNotEmpty()) {
                val members = restApi.getConversationMembers(ids)
                conversationDao.upsertMembers(members.map { it.toDomain().toEntity() })
            }
            syncStateDao.upsert(SyncStateEntity(KEY, now, null))
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun markRead(conversationId: String, messageId: String) =
        withContext(dispatchers.io) {
            conversationDao.updateUnreadCount(conversationId, 0)
        }

    override suspend fun setPinned(conversationId: String, pinned: Boolean) =
        withContext(dispatchers.io) { conversationDao.setPinned(conversationId, pinned) }

    override suspend fun setMuted(conversationId: String, muted: Boolean) =
        withContext(dispatchers.io) { conversationDao.setMuted(conversationId, muted) }

    private companion object {
        const val KEY = "conversations"
    }
}
