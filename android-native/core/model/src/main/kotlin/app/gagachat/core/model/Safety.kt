package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * GaGa Safe: a trusted person GaGa can notify when a timed check-in expires or
 * when the owner raises an SOS. A contact may be another GaGa user ([contactId]
 * set) or an off-app phone number ([phone] set) — the record is always private
 * to its owner.
 */
@Serializable
data class SafetyContact(
    val id: String,
    @SerialName("owner_id") val ownerId: String,
    val name: String,
    val phone: String = "",
    @SerialName("contact_id") val contactId: String? = null,
    val priority: Int = 0,
    @SerialName("created_at") val createdAt: String? = null,
)

/** Lifecycle of a timed Safe check-in. */
enum class SafetyStatus { PENDING, SAFE, ESCALATED, CANCELLED }

/**
 * A timed "check on me" record (GaGa Safe). It is private to its owner while
 * pending; if it is not resolved before [dueAt] it may be escalated, at which
 * point the owner's chosen safety contacts are notified. The record never
 * triggers a background emergency action on its own — escalation only happens
 * for a check-in the user explicitly created.
 */
@Serializable
data class SafetyCheckIn(
    val id: String,
    @SerialName("owner_id") val ownerId: String,
    val label: String,
    @SerialName("due_at") val dueAt: String,
    val status: String = "pending",
    @SerialName("chat_id") val chatId: String? = null,
    @SerialName("notified_at") val notifiedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
) {
    val safetyStatus: SafetyStatus
        get() = when (status.lowercase()) {
            "safe" -> SafetyStatus.SAFE
            "escalated" -> SafetyStatus.ESCALATED
            "cancelled" -> SafetyStatus.CANCELLED
            else -> SafetyStatus.PENDING
        }
}

/** A short-lived live-location share with an optional battery/time note (GaGa Safe). */
@Serializable
data class SafetyLiveShare(
    val id: String,
    @SerialName("owner_id") val ownerId: String,
    @SerialName("chat_id") val chatId: String,
    val latitude: Double,
    val longitude: Double,
    @SerialName("expires_at") val expiresAt: String,
    @SerialName("battery_percent") val batteryPercent: Int? = null,
    @SerialName("created_at") val createdAt: String? = null,
)
