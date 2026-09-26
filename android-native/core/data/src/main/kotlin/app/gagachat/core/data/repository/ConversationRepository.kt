package app.gagachat.core.data.repository

import app.gagachat.core.common.Constants
import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.IdGenerator
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.data.mapper.toDomain
import app.gagachat.core.database.dao.ConversationDao
import app.gagachat.core.database.dao.SyncStateDao
import app.gagachat.core.database.dao.UserDao
import app.gagachat.core.database.entity.SyncStateEntity
import app.gagachat.core.database.mapper.toDomain
import app.gagachat.core.database.mapper.toEntity
import app.gagachat.core.model.Conversation
import app.gagachat.core.model.ConversationMember
import app.gagachat.core.model.ConversationType
import app.gagachat.core.model.MemberRole
import app.gagachat.core.model.User
import app.gagachat.core.network.dto.ConversationInsert
import app.gagachat.core.network.dto.ConversationRow
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Conversation list access. The cached list renders instantly from Room while a
 * background delta sync updates only changed rows.
 */
interface ConversationRepository {
    fun observeConversations(): Flow<List<Conversation>>
    fun observeConversation(id: String): Flow<Conversation?>
    suspend fun syncConversations(): AppResult<Unit>
    suspend fun markRead(conversationId: String, messageId: String)
    suspend fun setPinned(conversationId: String, pinned: Boolean)
    suspend fun setMuted(conversationId: String, muted: Boolean)

    /** Remove a conversation locally and on the server (best-effort). */
    suspend fun deleteConversation(conversationId: String)

    /**
     * Returns the id of the DIRECT conversation between the two users, creating
     * it (locally + on the server) when it does not yet exist.
     */
    suspend fun openDirectConversation(currentUserId: String, otherUserId: String): AppResult<String>
}

@Singleton
class DefaultConversationRepository @Inject constructor(
    private val conversationDao: ConversationDao,
    private val syncStateDao: SyncStateDao,
    private val userDao: UserDao,
    private val restApi: SupabaseRestApi,
    private val idGenerator: IdGenerator,
    private val timeProvider: TimeProvider,
    private val dispatchers: DispatcherProvider,
) : ConversationRepository {

    override fun observeConversations(): Flow<List<Conversation>> =
        combine(
            conversationDao.observeAll(),
            conversationDao.observeAllMembers(),
            userDao.observeAll(),
        ) { entities, members, users ->
            val usersById = users.associate { it.id to it.toDomain() }
            val byConversation = members.groupBy { it.conversationId }
            entities.map { entity ->
                val conversationMembers = byConversation[entity.id]
                    ?.map { resolveMember(it.toDomain(), usersById) }
                    ?: emptyList()
                entity.toDomain(conversationMembers)
            }
        }

    override fun observeConversation(id: String): Flow<Conversation?> =
        combine(
            conversationDao.observeById(id),
            conversationDao.observeMembers(id),
            userDao.observeAll(),
        ) { entity, members, users ->
            val usersById = users.associate { it.id to it.toDomain() }
            entity?.toDomain(members.map { resolveMember(it.toDomain(), usersById) })
        }

    /**
     * Fills a conversation member's display identity from the cached users table
     * when the denormalised value is missing. This is the shared resolution step
     * that stops direct chats from rendering as "Unknown".
     */
    private fun resolveMember(member: ConversationMember, usersById: Map<String, User>): ConversationMember {
        val user = usersById[member.userId]
        return member.copy(
            displayName = member.displayName?.takeIf { it.isNotBlank() }
                ?: user?.displayLabel,
            avatar = member.avatar ?: user?.avatar,
        )
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

            // Resolve + cache participant profiles so members render real
            // identities (displayName → @username → … ) instead of "Unknown".
            val usersById = resolveAndCacheParticipants(rows.flatMap { it.participants ?: emptyList() }, now)

            val memberEntities = rows.flatMap { it.toMemberEntities(now, usersById) }
            if (memberEntities.isNotEmpty()) {
                conversationDao.upsertMembers(memberEntities)
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
            runCatching { restApi.updateConversationFlags(conversationId, unreadCount = 0) }
            Unit
        }

    override suspend fun setPinned(conversationId: String, pinned: Boolean) =
        withContext(dispatchers.io) {
            conversationDao.setPinned(conversationId, pinned)
            runCatching { restApi.updateConversationFlags(conversationId, pinned = pinned) }
            Unit
        }

    override suspend fun setMuted(conversationId: String, muted: Boolean) =
        withContext(dispatchers.io) {
            conversationDao.setMuted(conversationId, muted)
            runCatching { restApi.updateConversationFlags(conversationId, muted = muted) }
            Unit
        }

    override suspend fun deleteConversation(conversationId: String) =
        withContext(dispatchers.io) {
            conversationDao.deleteMembers(conversationId)
            conversationDao.deleteById(conversationId)
            runCatching { restApi.deleteConversation(conversationId) }
            Unit
        }

    override suspend fun openDirectConversation(
        currentUserId: String,
        otherUserId: String,
    ): AppResult<String> = withContext(dispatchers.io) {
        try {
            // 1. Local cache hit.
            conversationDao.findDirectConversation(currentUserId, otherUserId)?.let {
                return@withContext AppResult.Success(it.id)
            }
            // 2. Server lookup.
            restApi.findDirectConversation(currentUserId, otherUserId)?.let { row ->
                cacheConversation(row)
                return@withContext AppResult.Success(row.id)
            }
            // 3. Create a new deterministic direct chat.
            val id = directChatId(currentUserId, otherUserId)
            val now = timeProvider.nowMillis()
            val insert = ConversationInsert(
                id = id,
                type = "direct",
                participants = listOf(currentUserId, otherUserId),
                createdBy = currentUserId,
            )
            val created = runCatching { restApi.insertConversation(insert) }.getOrNull()
            val row = created ?: ConversationRow(
                id = id,
                type = "direct",
                participants = listOf(currentUserId, otherUserId),
                createdBy = currentUserId,
                updatedAt = now,
                createdAt = now,
            )
            cacheConversation(row)
            AppResult.Success(row.id)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    private suspend fun cacheConversation(row: ConversationRow) {
        val now = timeProvider.nowMillis()
        conversationDao.upsert(row.toDomain().toEntity(now))
        val usersById = resolveAndCacheParticipants(row.participants ?: emptyList(), now)
        conversationDao.upsertMembers(row.toMemberEntities(now, usersById))
    }

    /**
     * Fetches the given user ids from the backend, caches them locally and returns
     * them keyed by id. Best-effort: a failure degrades to an empty map so callers
     * still persist the conversation/membership rows.
     */
    private suspend fun resolveAndCacheParticipants(ids: List<String>, now: Long): Map<String, User> {
        val distinct = ids.filter { it.isNotBlank() }.distinct()
        if (distinct.isEmpty()) return emptyMap()
        return runCatching {
            val users = restApi.getUsers(distinct).map { it.toDomain() }
            if (users.isNotEmpty()) userDao.upsertAll(users.map { it.toEntity(now) })
            users.associateBy { it.id }
        }.getOrDefault(emptyMap())
    }

    private fun directChatId(a: String, b: String): String {
        val ordered = listOf(a, b).sorted()
        return "dm_${ordered[0]}_${ordered[1]}"
    }

    private companion object {
        const val KEY = "conversations"
    }
}

/** Build member rows from a chat's `participants`/`admins` arrays. */
private fun ConversationRow.toMemberEntities(
    now: Long,
    usersById: Map<String, User>,
): List<app.gagachat.core.database.entity.ConversationMemberEntity> {
    val participants = participants ?: return emptyList()
    val adminSet = (admins ?: emptyList()).toSet()
    return participants.map { userId ->
        val user = usersById[userId]
        ConversationMember(
            conversationId = id,
            userId = userId,
            role = if (userId in adminSet) MemberRole.ADMIN else MemberRole.MEMBER,
            joinedAt = createdAt ?: now,
            lastReadMessageId = null,
            displayName = user?.displayLabel,
            avatar = user?.avatar,
        ).toEntity()
    }
}
