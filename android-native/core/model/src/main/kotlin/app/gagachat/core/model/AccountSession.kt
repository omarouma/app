package app.gagachat.core.model
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
@Serializable data class AccountSession(val id: String, @SerialName("user_agent") val userAgent: String? = null,
    @SerialName("created_at") val createdAt: String? = null, @SerialName("last_activity") val lastActivity: String? = null,
    @SerialName("is_current") val isCurrent: Boolean = false)
