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
import app.gagachat.core.model.AppNotification
import app.gagachat.core.model.NotificationType
import app.gagachat.core.network.dto.NotificationRow
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * In-app notifications (LIVE table `notifications`). Network-first with an
 * in-memory cache; unread count is fetched across all server pages.
 */
interface NotificationRepository {
    val notifications: StateFlow<List<AppNotification>>
    val unreadCount: StateFlow<Int>

    suspend fun refresh(): AppResult<Unit>
    suspend fun markRead(id: String): AppResult<Unit>
    suspend fun markAllRead(): AppResult<Unit>
    suspend fun loadMore(): AppResult<Unit>
    suspend fun dismiss(ids: List<String>): AppResult<Unit>
    val hasMore: StateFlow<Boolean>
}

@Singleton
class DefaultNotificationRepository @Inject constructor(
    private val restApi: SupabaseRestApi,
    private val authRepository: AuthRepository,
    private val dispatchers: DispatcherProvider,
    @ApplicationScope scope: CoroutineScope,
) : NotificationRepository {

    private val _notifications = MutableStateFlow<List<AppNotification>>(emptyList())
    override val notifications: StateFlow<List<AppNotification>> = _notifications.asStateFlow()

    private val _unreadCount = MutableStateFlow(0)
    override val unreadCount: StateFlow<Int> = _unreadCount.asStateFlow()

    private val _hasMore = MutableStateFlow(false)
    override val hasMore = _hasMore.asStateFlow()
    private val inboxMutex = Mutex()
    private var nextOffset = 0
    private var generation = 0

    init {
        var previousOwner = authRepository.sessionFlow.value?.userId
        scope.launch {
            authRepository.sessionFlow.map { it?.userId }.distinctUntilChanged().collect { owner ->
                if (owner != previousOwner) {
                _notifications.value = emptyList()
                _unreadCount.value = 0
                _hasMore.value = false
                nextOffset = 0
                generation++
                }
                previousOwner = owner
            }
        }
    }

    private val currentUserId: String
        get() = authRepository.sessionFlow.value?.userId.orEmpty()

    override suspend fun refresh(): AppResult<Unit> = inboxMutex.withLock { refreshInbox() }

    private suspend fun refreshInbox(): AppResult<Unit> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized("Not signed in"))
        try {
            val limit = maxOf(50, nextOffset)
            val rows = restApi.getNotifications(me, limit)
            val unread = restApi.getUnreadNotificationCount(me)
            if (me != currentUserId) return@withContext AppResult.Failure(AppError.Unauthorized("Account changed"))
            _notifications.value = rows.map { it.toDomain() }
            nextOffset = rows.size
            _hasMore.value = rows.size == limit
            generation++
            _unreadCount.value = unread
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun markRead(id: String): AppResult<Unit> = withContext(dispatchers.io) { inboxMutex.withLock {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
        try {
            restApi.markNotificationRead(id)
            val unread = restApi.getUnreadNotificationCount(me)
            if (me != currentUserId) return@withContext AppResult.Failure(AppError.Unauthorized("Account changed"))
            _notifications.value = _notifications.value.map { if (it.id == id) it.copy(read = true) else it }
            _unreadCount.value = unread
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    } }

    override suspend fun markAllRead(): AppResult<Unit> = withContext(dispatchers.io) { inboxMutex.withLock {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
        try {
            restApi.markAllNotificationsRead(me)
            // A new notification may arrive after the PATCH; do not force badge zero.
            val limit = maxOf(50, nextOffset)
            val rows = restApi.getNotifications(me, limit)
            val unread = restApi.getUnreadNotificationCount(me)
            if (me != currentUserId) return@withContext AppResult.Failure(AppError.Unauthorized("Account changed"))
            _notifications.value = rows.map { it.toDomain() }
            nextOffset = rows.size
            _hasMore.value = rows.size == limit
            generation++
            _unreadCount.value = unread
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    } }
    override suspend fun loadMore(): AppResult<Unit> = withContext(dispatchers.io) { inboxMutex.withLock {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
        if (!_hasMore.value) return@withContext AppResult.Success(Unit)
        val snapshot = generation
        val offset = nextOffset
        try {
            val rows = restApi.getNotificationsPage(me, offset)
            if (me != currentUserId || snapshot != generation || offset != nextOffset)
                return@withContext AppResult.Failure(AppError.Unauthorized("Inbox changed; refresh and try again"))
            _notifications.value = (_notifications.value + rows.map { it.toDomain() }).distinctBy { it.id }
            nextOffset += rows.size
            _hasMore.value = rows.size == 50
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    } }

    override suspend fun dismiss(ids: List<String>): AppResult<Unit> = withContext(dispatchers.io) { inboxMutex.withLock {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
        try {
            require(ids.isNotEmpty() && ids.size <= 100)
            require(ids.all { id -> _notifications.value.any { it.id == id && it.userId == me } })
            restApi.dismissNotifications(me, ids)
            if (me != currentUserId) return@withContext AppResult.Failure(AppError.Unauthorized("Account changed"))
            _notifications.value = _notifications.value.filterNot { it.id in ids }
            generation++
            refreshInbox()
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    } }

}

private fun NotificationRow.toDomain(): AppNotification = AppNotification(
    id = id,
    userId = userId,
    type = type.toNotificationType(),
    title = title,
    body = body,
    data = data?.toString(),
    read = read ?: false,
    createdAt = createdAt ?: 0L,
)

private fun String?.toNotificationType(): NotificationType = when (this?.lowercase()) {
    "message" -> NotificationType.MESSAGE
    "friend_request" -> NotificationType.FRIEND_REQUEST
    "friend_accepted" -> NotificationType.FRIEND_ACCEPTED
    "call" -> NotificationType.CALL
    "group_invite" -> NotificationType.GROUP_INVITE
    "wallet" -> NotificationType.WALLET
    else -> NotificationType.SYSTEM
}
