package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
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
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * In-app notifications (LIVE table `notifications`). Network-first with an
 * in-memory cache; unread count is derived from the cached list.
 */
interface NotificationRepository {
    val notifications: StateFlow<List<AppNotification>>
    val unreadCount: StateFlow<Int>

    suspend fun refresh(): AppResult<Unit>
    suspend fun markRead(id: String): AppResult<Unit>
    suspend fun markAllRead(): AppResult<Unit>
}

@Singleton
class DefaultNotificationRepository @Inject constructor(
    private val restApi: SupabaseRestApi,
    private val authRepository: AuthRepository,
    private val dispatchers: DispatcherProvider,
) : NotificationRepository {

    private val _notifications = MutableStateFlow<List<AppNotification>>(emptyList())
    override val notifications: StateFlow<List<AppNotification>> = _notifications.asStateFlow()

    private val _unreadCount = MutableStateFlow(0)
    override val unreadCount: StateFlow<Int> = _unreadCount.asStateFlow()

    private val currentUserId: String
        get() = authRepository.sessionFlow.value?.userId.orEmpty()

    override suspend fun refresh(): AppResult<Unit> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized("Not signed in"))
        try {
            val rows = restApi.getNotifications(me)
            _notifications.value = rows.map { it.toDomain() }
            _unreadCount.value = _notifications.value.count { !it.read }
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun markRead(id: String): AppResult<Unit> = withContext(dispatchers.io) {
        try {
            restApi.markNotificationRead(id)
            _notifications.value = _notifications.value.map { if (it.id == id) it.copy(read = true) else it }
            _unreadCount.value = _notifications.value.count { !it.read }
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun markAllRead(): AppResult<Unit> = withContext(dispatchers.io) {
        try {
            _notifications.value.filter { !it.read }.forEach { runCatching { restApi.markNotificationRead(it.id) } }
            _notifications.value = _notifications.value.map { it.copy(read = true) }
            _unreadCount.value = 0
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }
}

private fun NotificationRow.toDomain(): AppNotification = AppNotification(
    id = id,
    userId = userId,
    type = type.toNotificationType(),
    title = title,
    body = body,
    data = data,
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
