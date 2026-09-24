package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Registered device for push routing and session revocation (PDF §7.1 `devices`,
 * §11 device/session revocation).
 */
@Serializable
data class Device(
    @SerialName("user_id") val userId: String,
    @SerialName("device_id") val deviceId: String,
    @SerialName("push_token") val pushToken: String? = null,
    val platform: String = "android",
    @SerialName("last_active") val lastActive: Long = 0L,
    @SerialName("app_version") val appVersion: String? = null,
)
