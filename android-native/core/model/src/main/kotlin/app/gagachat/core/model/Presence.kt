package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Ephemeral presence. Never persisted as durable truth (PDF §4) — held in a
 * short-lived in-memory store and refreshed from the realtime channel.
 */
@Serializable
data class Presence(
    @SerialName("user_id") val userId: String,
    val status: UserStatus = UserStatus.OFFLINE,
    @SerialName("last_seen") val lastSeen: Long = 0L,
    @SerialName("updated_at") val updatedAt: Long = 0L,
)

/**
 * Ephemeral typing indicator (PDF §5.4).
 */
@Serializable
data class TypingState(
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("user_id") val userId: String,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("updated_at") val updatedAt: Long = 0L,
)
