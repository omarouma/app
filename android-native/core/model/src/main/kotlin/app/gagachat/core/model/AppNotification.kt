package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * An in-app notification (LIVE table `notifications`).
 */
@Serializable
data class AppNotification(
    val id: String,
    @SerialName("user_id") val userId: String,
    val type: NotificationType = NotificationType.SYSTEM,
    val title: String? = null,
    val body: String? = null,
    val data: String? = null,
    val read: Boolean = false,
    @SerialName("created_at") val createdAt: Long = 0L,
)

@Serializable
enum class NotificationType {
    @SerialName("message") MESSAGE,
    @SerialName("friend_request") FRIEND_REQUEST,
    @SerialName("friend_accepted") FRIEND_ACCEPTED,
    @SerialName("call") CALL,
    @SerialName("group_invite") GROUP_INVITE,
    @SerialName("wallet") WALLET,
    @SerialName("system") SYSTEM,
}
