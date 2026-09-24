package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Domain user (PDF §7.1 `users`).
 * `id` is the backend identity (Supabase auth uid).
 */
@Serializable
data class User(
    val id: String,
    @SerialName("display_name") val displayName: String,
    val username: String? = null,
    val avatar: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val bio: String? = null,
    val status: UserStatus = UserStatus.OFFLINE,
    @SerialName("last_seen") val lastSeen: Long? = null,
    @SerialName("created_at") val createdAt: Long = 0L,
    @SerialName("is_verified") val isVerified: Boolean = false,
    @SerialName("is_premium") val isPremium: Boolean = false,
) {
    val initials: String
        get() = displayName.trim().split(" ")
            .filter { it.isNotBlank() }
            .take(2)
            .joinToString("") { it.first().uppercase() }
            .ifEmpty { "?" }
}

@Serializable
enum class UserStatus {
    @SerialName("online") ONLINE,
    @SerialName("away") AWAY,
    @SerialName("busy") BUSY,
    @SerialName("offline") OFFLINE,
}
