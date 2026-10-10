package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.di.ApplicationScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.collect
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.data.mapper.toDomain
import app.gagachat.core.model.Friend
import app.gagachat.core.model.FriendRequest
import app.gagachat.core.model.FriendRequestStatus
import app.gagachat.core.model.User
import app.gagachat.core.network.dto.FriendRequestInsert
import app.gagachat.core.network.dto.FriendRequestRpcResult
import app.gagachat.core.network.dto.FriendshipInsert
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.error.RpcAvailability
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
    @ApplicationScope scope: CoroutineScope,
) : FriendsRepository {

    private val _friends = MutableStateFlow<List<Friend>>(emptyList())
    override val friends: StateFlow<List<Friend>> = _friends.asStateFlow()

    private val _incoming = MutableStateFlow<List<FriendRequest>>(emptyList())
    override val incomingRequests: StateFlow<List<FriendRequest>> = _incoming.asStateFlow()

    private val _outgoing = MutableStateFlow<List<FriendRequest>>(emptyList())
    override val outgoingRequests: StateFlow<List<FriendRequest>> = _outgoing.asStateFlow()

    init {
        var previousOwner = authRepository.sessionFlow.value?.userId
        scope.launch {
            authRepository.sessionFlow.map { it?.userId }.distinctUntilChanged().collect { owner ->
                if (owner != previousOwner) {
                _friends.value = emptyList(); _incoming.value = emptyList(); _outgoing.value = emptyList()
                }
                previousOwner = owner
            }
        }
    }

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
            val friends = friendIds.mapNotNull { id ->
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
                val to = requestUserById[row.toUserId]
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
                    toName = to?.displayName ?: to?.name ?: to?.username,
                    toAvatar = to?.avatar,
                )
            }
            if (me != currentUserId) return@withContext AppResult.Failure(AppError.Unauthorized("Account changed"))
            _friends.value = friends
            _incoming.value = mapped.filter { it.toUserId == me && it.status == FriendRequestStatus.PENDING }
            _outgoing.value = mapped.filter { it.fromUserId == me && it.status == FriendRequestStatus.PENDING }

            // Cache users so profiles resolve offline.
            userRepository.cacheUsers(friendUsers.map { it.toDomain() })
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun sendRequest(toUserId: String, message: String?): AppResult<Unit> =
        withContext(dispatchers.io) {
            val me = currentUserId
            if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
            if (me == toUserId) return@withContext AppResult.Failure(AppError.Validation("You can't add yourself"))
            if (_friends.value.any { it.user.id == toUserId }) {
                return@withContext AppResult.Failure(AppError.Validation("You're already friends"))
            }
            if (_outgoing.value.any { it.toUserId == toUserId }) {
                return@withContext AppResult.Failure(AppError.Validation("Request already sent"))
            }
            // If they already asked us, treat this as a mutual match: accept it.
            val incoming = _incoming.value.firstOrNull { it.fromUserId == toUserId }
            if (incoming != null) {
                return@withContext acceptRequest(incoming.id, incoming.fromUserId)
            }
            try {
                restApi.insertFriendRequest(FriendRequestInsert(fromUserId = me, toUserId = toUserId, message = message))
                refresh()
                AppResult.Success(Unit)
            } catch (t: Throwable) {
            if (t is CancellationException) throw t
                AppResult.Failure(ErrorMapper.map(t))
            }
        }

    override suspend fun acceptRequest(requestId: String, fromUserId: String): AppResult<Unit> =
        withContext(dispatchers.io) {
            val me = currentUserId
            if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
            try {
                // Atomic: status change + both friendship edges in one transaction,
                // so the sender and the recipient can never disagree (FR-04).
                val rpc = restApi.acceptFriendRequestRpc(requestId)
                if (rpc.error != null) return@withContext AppResult.Failure(rpc.toAppError())
                refresh()
                AppResult.Success(Unit)
            } catch (t: Throwable) {
                if (t is CancellationException) throw t
                if (RpcAvailability.isUnavailable(t)) return@withContext legacyAccept(requestId, fromUserId)
                AppResult.Failure(ErrorMapper.map(t))
            }
        }

    override suspend fun declineRequest(requestId: String): AppResult<Unit> =
        withContext(dispatchers.io) {
            try {
                val rpc = restApi.declineFriendRequestRpc(requestId)
                if (rpc.error != null) return@withContext AppResult.Failure(rpc.toAppError())
                refresh()
                AppResult.Success(Unit)
            } catch (t: Throwable) {
                if (t is CancellationException) throw t
                if (RpcAvailability.isUnavailable(t)) return@withContext legacyDecline(requestId)
                AppResult.Failure(ErrorMapper.map(t))
            }
        }

    override suspend fun cancelRequest(requestId: String): AppResult<Unit> =
        withContext(dispatchers.io) {
            try {
                val rpc = restApi.cancelFriendRequestRpc(requestId)
                if (rpc.error != null) return@withContext AppResult.Failure(rpc.toAppError())
                refresh()
                AppResult.Success(Unit)
            } catch (t: Throwable) {
                if (t is CancellationException) throw t
                if (RpcAvailability.isUnavailable(t)) return@withContext legacyCancel(requestId)
                AppResult.Failure(ErrorMapper.map(t))
            }
        }

    /**
     * Pre-RPC accept path, retained only as a rollout fallback for a backend that
     * has not yet applied the lifecycle migration. Kept deliberately close to the
     * old behaviour so nothing regresses during the transition.
     */
    private suspend fun legacyAccept(requestId: String, fromUserId: String): AppResult<Unit> {
        val me = currentUserId
        return try {
            restApi.updateFriendRequestStatus(requestId, "accepted")
            restApi.insertFriendship(FriendshipInsert(userId = me, friendId = fromUserId))
            restApi.insertFriendship(FriendshipInsert(userId = fromUserId, friendId = me))
            refresh()
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    private suspend fun legacyDecline(requestId: String): AppResult<Unit> = try {
        // The `guard_friend_request()` trigger only accepts the canonical
        // "rejected" status. The old client sent "declined", which the guard
        // refused with a 400, leaving the request stuck in "pending" forever.
        restApi.updateFriendRequestStatus(requestId, "rejected")
        refresh()
        AppResult.Success(Unit)
    } catch (t: Throwable) {
        if (t is CancellationException) throw t
        AppResult.Failure(ErrorMapper.map(t))
    }

    private suspend fun legacyCancel(requestId: String): AppResult<Unit> = try {
        restApi.updateFriendRequestStatus(requestId, "cancelled")
        refresh()
        AppResult.Success(Unit)
    } catch (t: Throwable) {
        if (t is CancellationException) throw t
        AppResult.Failure(ErrorMapper.map(t))
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
            if (t is CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun isFriend(userId: String): Boolean = withContext(dispatchers.io) {
        _friends.value.any { it.user.id == userId }
    }
}

internal fun String?.toRequestStatus(): FriendRequestStatus = when (this?.lowercase()) {
    "accepted" -> FriendRequestStatus.ACCEPTED
    // The backend stores the canonical "rejected"; older rows/clients used
    // "declined". Both must map to DECLINED so a declined request is never
    // mistaken for a still-pending one.
    "declined", "rejected" -> FriendRequestStatus.DECLINED
    "cancelled", "canceled" -> FriendRequestStatus.CANCELLED
    else -> FriendRequestStatus.PENDING
}

/** Turns a lifecycle-RPC rejection code into a user-facing [AppError]. */
internal fun FriendRequestRpcResult.toAppError(): AppError = when (error) {
    "NOT_AUTHENTICATED" -> AppError.Unauthorized()
    "REQUEST_NOT_FOUND" -> AppError.Validation("This request is no longer available")
    "NOT_RECIPIENT", "NOT_SENDER" -> AppError.Forbidden("This request isn't yours to action")
    "BLOCKED" -> AppError.Forbidden("You can't connect with a blocked account")
    "REQUEST_NOT_PENDING" -> AppError.Validation("This request was already handled")
    else -> AppError.Unknown(error)
}
