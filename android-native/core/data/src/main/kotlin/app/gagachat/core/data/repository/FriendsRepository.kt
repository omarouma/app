package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.data.mapper.toDomain
import app.gagachat.core.model.Friend
import app.gagachat.core.model.FriendRequest
import app.gagachat.core.model.FriendRequestStatus
import app.gagachat.core.model.User
import app.gagachat.core.network.dto.FriendRequestInsert
import app.gagachat.core.network.dto.FriendshipInsert
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Friends & friend-requests (LIVE tables `friendships`, `friend_requests`).
 *
 * Network-first with an in-memory cache so the People screen renders instantly
 * after the first load. Friendships are stored symmetrically (one row per
 * direction) and created on accept.
 */
interface FriendsRepository {
    val friends: StateFlow<List<Friend>>
    val incomingRequests: StateFlow<List<FriendRequest>>
    val outgoingRequests: StateFlow<List<FriendRequest>>

    suspend fun refresh(): AppResult<Unit>
    suspend fun sendRequest(toUserId: String, message: String? = null): AppResult<Unit>
    suspend fun acceptRequest(requestId: String, fromUserId: String): AppResult<Unit>
    suspend fun declineRequest(requestId: String): AppResult<Unit>
    suspend fun cancelRequest(requestId: String): AppResult<Unit>
    suspend fun removeFriend(friendId: String): AppResult<Unit>
    suspend fun isFriend(userId: String): Boolean
}

@Singleton
class DefaultFriendsRepository @Inject constructor(
    private val restApi: SupabaseRestApi,
    private val authRepository: AuthRepository,
    private val userRepository: UserRepository,
    private val timeProvider: TimeProvider,
    private val dispatchers: DispatcherProvider,
) : FriendsRepository {

    private val _friends = MutableStateFlow<List<Friend>>(emptyList())
    override val friends: StateFlow<List<Friend>> = _friends.asStateFlow()

    private val _incoming = MutableStateFlow<List<FriendRequest>>(emptyList())
    override val incomingRequests: StateFlow<List<FriendRequest>> = _incoming.asStateFlow()

    private val _outgoing = MutableStateFlow<List<FriendRequest>>(emptyList())
    override val outgoingRequests: StateFlow<List<FriendRequest>> = _outgoing.asStateFlow()

    private val currentUserId: String
        get() = authRepository.sessionFlow.value?.userId.orEmpty()

    override suspend fun refresh(): AppResult<Unit> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized("Not signed in"))
        try {
            val friendshipRows = restApi.getFriendships(me)
            val friendIds = friendshipRows.map { it.friendId }.distinct()
            val friendUsers = if (friendIds.isEmpty()) emptyList() else restApi.getUsers(friendIds)
            val byId = friendUsers.associateBy { it.id }
            val sinceById = friendshipRows.associate { it.friendId to (it.createdAt ?: 0L) }
            _friends.value = friendIds.mapNotNull { id ->
                byId[id]?.let { row ->
                    Friend(
                        user = row.toDomain(),
                        friendsSince = sinceById[id] ?: 0L,
                        isOnline = row.status.equals("online", ignoreCase = true),
                    )
                }
            }

            val requests = restApi.getFriendRequests(me)
            val requestUserIds = requests.flatMap { listOf(it.fromUserId, it.toUserId) }.distinct()
            val requestUsers = if (requestUserIds.isEmpty()) emptyList() else restApi.getUsers(requestUserIds)
            val requestUserById = requestUsers.associateBy { it.id }

            val mapped = requests.map { row ->
                val from = requestUserById[row.fromUserId]
                FriendRequest(
                    id = row.id,
                    fromUserId = row.fromUserId,
                    toUserId = row.toUserId,
                    status = row.status.toRequestStatus(),
                    message = row.message,
                    createdAt = row.createdAt ?: 0L,
                    updatedAt = row.updatedAt ?: 0L,
                    fromName = from?.displayName ?: from?.name ?: from?.username,
                    fromAvatar = from?.avatar,
                )
            }
            _incoming.value = mapped.filter { it.toUserId == me && it.status == FriendRequestStatus.PENDING }
            _outgoing.value = mapped.filter { it.fromUserId == me && it.status == FriendRequestStatus.PENDING }

            // Cache users so profiles resolve offline.
            userRepository.cacheUsers(friendUsers.map { it.toDomain() })
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun sendRequest(toUserId: String, message: String?): AppResult<Unit> =
        withContext(dispatchers.io) {
            val me = currentUserId
            if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
            if (me == toUserId) return@withContext AppResult.Failure(AppError.Validation("You can't add yourself"))
            try {
                restApi.insertFriendRequest(FriendRequestInsert(fromUserId = me, toUserId = toUserId, message = message))
                refresh()
                AppResult.Success(Unit)
            } catch (t: Throwable) {
                AppResult.Failure(ErrorMapper.map(t))
            }
        }

    override suspend fun acceptRequest(requestId: String, fromUserId: String): AppResult<Unit> =
        withContext(dispatchers.io) {
            val me = currentUserId
            if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
            try {
                restApi.updateFriendRequestStatus(requestId, "accepted")
                // Symmetric friendship edges.
                restApi.insertFriendship(FriendshipInsert(userId = me, friendId = fromUserId))
                restApi.insertFriendship(FriendshipInsert(userId = fromUserId, friendId = me))
                refresh()
                AppResult.Success(Unit)
            } catch (t: Throwable) {
                AppResult.Failure(ErrorMapper.map(t))
            }
        }

    override suspend fun declineRequest(requestId: String): AppResult<Unit> =
        withContext(dispatchers.io) {
            try {
                restApi.updateFriendRequestStatus(requestId, "declined")
                refresh()
                AppResult.Success(Unit)
            } catch (t: Throwable) {
                AppResult.Failure(ErrorMapper.map(t))
            }
        }

    override suspend fun cancelRequest(requestId: String): AppResult<Unit> =
        withContext(dispatchers.io) {
            try {
                restApi.updateFriendRequestStatus(requestId, "cancelled")
                refresh()
                AppResult.Success(Unit)
            } catch (t: Throwable) {
                AppResult.Failure(ErrorMapper.map(t))
            }
        }

    override suspend fun removeFriend(friendId: String): AppResult<Unit> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
        try {
            restApi.deleteFriendship(me, friendId)
            restApi.deleteFriendship(friendId, me)
            refresh()
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun isFriend(userId: String): Boolean = withContext(dispatchers.io) {
        _friends.value.any { it.user.id == userId }
    }
}

private fun String?.toRequestStatus(): FriendRequestStatus = when (this?.lowercase()) {
    "accepted" -> FriendRequestStatus.ACCEPTED
    "declined" -> FriendRequestStatus.DECLINED
    "cancelled" -> FriendRequestStatus.CANCELLED
    else -> FriendRequestStatus.PENDING
}
