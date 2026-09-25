package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.IdGenerator
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.data.mapper.toDomain
import app.gagachat.core.model.Group
import app.gagachat.core.model.GroupMember
import app.gagachat.core.model.GroupRole
import app.gagachat.core.network.dto.ConversationInsert
import app.gagachat.core.network.dto.GroupInsert
import app.gagachat.core.network.dto.GroupMemberInsert
import app.gagachat.core.network.dto.GroupMemberRow
import app.gagachat.core.network.dto.GroupRow
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Groups (LIVE tables `groups` + `group_members`). A group is also mirrored as
 * a conversation row (type = `group`) so it appears in the chat list and can
 * carry messages through the existing message pipeline.
 */
interface GroupRepository {
    val groups: StateFlow<List<Group>>

    suspend fun refresh(): AppResult<Unit>
    suspend fun getGroup(groupId: String): AppResult<Group>
    suspend fun createGroup(name: String, description: String?, memberIds: List<String>): AppResult<Group>
    suspend fun updateGroup(groupId: String, name: String?, description: String?, avatar: String?): AppResult<Unit>
    suspend fun addMembers(groupId: String, userIds: List<String>): AppResult<Unit>
    suspend fun removeMember(groupId: String, userId: String): AppResult<Unit>
    suspend fun leaveGroup(groupId: String): AppResult<Unit>
    suspend fun deleteGroup(groupId: String): AppResult<Unit>
}

@Singleton
class DefaultGroupRepository @Inject constructor(
    private val restApi: SupabaseRestApi,
    private val authRepository: AuthRepository,
    private val userRepository: UserRepository,
    private val idGenerator: IdGenerator,
    private val timeProvider: TimeProvider,
    private val dispatchers: DispatcherProvider,
) : GroupRepository {

    private val _groups = MutableStateFlow<List<Group>>(emptyList())
    override val groups: StateFlow<List<Group>> = _groups.asStateFlow()

    private val currentUserId: String
        get() = authRepository.sessionFlow.value?.userId.orEmpty()

    override suspend fun refresh(): AppResult<Unit> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized("Not signed in"))
        try {
            val rows = restApi.getGroupsForUser(me)
            _groups.value = rows.map { row ->
                val members = loadMembers(row.id)
                row.toDomain(members)
            }
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun getGroup(groupId: String): AppResult<Group> = withContext(dispatchers.io) {
        try {
            val row = restApi.getGroup(groupId)
                ?: return@withContext AppResult.Failure(AppError.Database("Group not found"))
            AppResult.Success(row.toDomain(loadMembers(groupId)))
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun createGroup(
        name: String,
        description: String?,
        memberIds: List<String>,
    ): AppResult<Group> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
        if (name.isBlank()) return@withContext AppResult.Failure(AppError.Validation("Group name is required"))
        try {
            val groupId = idGenerator.newConversationId()
            val row = restApi.insertGroup(
                GroupInsert(id = groupId, name = name.trim(), description = description?.trim()?.ifBlank { null }, createdBy = me),
            )
            // Owner + initial members.
            restApi.insertGroupMember(GroupMemberInsert(groupId = groupId, userId = me, role = "owner"))
            val others = (memberIds + me).distinct().filter { it != me }
            others.forEach { uid ->
                restApi.insertGroupMember(GroupMemberInsert(groupId = groupId, userId = uid, role = "member"))
            }
            // Mirror as a conversation so it shows in the chat list.
            val participants = (listOf(me) + others).distinct()
            runCatching {
                restApi.insertConversation(
                    ConversationInsert(
                        id = groupId,
                        type = "group",
                        participants = participants,
                        title = name.trim(),
                        description = description?.trim(),
                        createdBy = me,
                        admins = listOf(me),
                    ),
                )
            }
            val group = row.toDomain(loadMembers(groupId))
            refresh()
            AppResult.Success(group)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun updateGroup(
        groupId: String,
        name: String?,
        description: String?,
        avatar: String?,
    ): AppResult<Unit> = withContext(dispatchers.io) {
        try {
            restApi.updateGroup(groupId, name, description, avatar)
            runCatching {
                restApi.updateConversationMeta(groupId, title = name, avatar = avatar, description = description)
            }
            refresh()
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun addMembers(groupId: String, userIds: List<String>): AppResult<Unit> =
        withContext(dispatchers.io) {
            try {
                userIds.distinct().forEach { uid ->
                    runCatching { restApi.insertGroupMember(GroupMemberInsert(groupId = groupId, userId = uid)) }
                }
                refresh()
                AppResult.Success(Unit)
            } catch (t: Throwable) {
                AppResult.Failure(ErrorMapper.map(t))
            }
        }

    override suspend fun removeMember(groupId: String, userId: String): AppResult<Unit> =
        withContext(dispatchers.io) {
            try {
                restApi.deleteGroupMember(groupId, userId)
                refresh()
                AppResult.Success(Unit)
            } catch (t: Throwable) {
                AppResult.Failure(ErrorMapper.map(t))
            }
        }

    override suspend fun leaveGroup(groupId: String): AppResult<Unit> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
        try {
            restApi.deleteGroupMember(groupId, me)
            _groups.value = _groups.value.filterNot { it.id == groupId }
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun deleteGroup(groupId: String): AppResult<Unit> = withContext(dispatchers.io) {
        try {
            restApi.deleteGroup(groupId)
            _groups.value = _groups.value.filterNot { it.id == groupId }
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    private suspend fun loadMembers(groupId: String): List<GroupMember> {
        val rows = restApi.getGroupMembers(groupId)
        if (rows.isEmpty()) return emptyList()
        val userIds = rows.map { it.userId }.distinct()
        val users = runCatching { restApi.getUsers(userIds) }.getOrDefault(emptyList())
        val byId = users.associateBy { it.id }
        userRepository.cacheUsers(users.map { it.toDomain() })
        return rows.map { row -> row.toDomain(byId[row.userId]?.displayName ?: byId[row.userId]?.name, byId[row.userId]?.avatar) }
    }
}

private fun GroupRow.toDomain(members: List<GroupMember>): Group = Group(
    id = id,
    name = name,
    description = description,
    avatar = avatar,
    createdBy = createdBy,
    createdAt = createdAt ?: 0L,
    updatedAt = updatedAt ?: 0L,
    members = members,
)

private fun GroupMemberRow.toDomain(displayName: String?, avatar: String?): GroupMember = GroupMember(
    id = id,
    groupId = groupId,
    userId = userId,
    role = role.toGroupRole(),
    joinedAt = joinedAt ?: 0L,
    displayName = displayName,
    avatar = avatar,
)

private fun String?.toGroupRole(): GroupRole = when (this?.lowercase()) {
    "owner" -> GroupRole.OWNER
    "admin" -> GroupRole.ADMIN
    else -> GroupRole.MEMBER
}
