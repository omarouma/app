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
        get() = displayLabel.trim().split(" ")
            .filter { it.isNotBlank() }
            .take(2)
            .joinToString("") { it.first().uppercase() }
            .ifEmpty { "?" }

    /**
     * The single, authoritative human label for this user, implementing the
     * app-wide fallback hierarchy (Master Spec §C — identity resolution):
     *
     *   displayName → @username → phone → email → "GaGa User"
     *
     * A backend-connected user must NEVER render as "Unknown"/"User"/a raw id.
     * Every screen (Calls, Chat list, Contacts, People, Profile, QR, Groups)
     * resolves identity through this property so the fallback is identical
     * everywhere.
     */
    val displayLabel: String
        get() = displayName.trim().takeIf { it.isNotEmpty() }
            ?: username?.trim()?.takeIf { it.isNotEmpty() }?.let { "@$it" }
            ?: phone?.trim()?.takeIf { it.isNotEmpty() }
            ?: email?.trim()?.takeIf { it.isNotEmpty() }
            ?: "GaGa User"

    /** True when only the generic fallback label is available (no real identity). */
    val hasResolvedIdentity: Boolean
        get() = displayName.isNotBlank() || !username.isNullOrBlank()
}

@Serializable
enum class UserStatus {
    @SerialName("online") ONLINE,
    @SerialName("away") AWAY,
    @SerialName("busy") BUSY,
    @SerialName("offline") OFFLINE,
}
