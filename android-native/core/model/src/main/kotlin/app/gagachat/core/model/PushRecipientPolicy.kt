package app.gagachat.core.model

/**
 * Rejects inbound FCM events for another account on a shared Android device.
 *
 * A former signed-in user can still have a stale FCM token registered until
 * the server detects it is unregistered or the app removes that device row.
 * Never show the push for the wrong currently active account.
 *
 * All recipient claims present in the payload must agree; checking only the
 * first key lets conflicting old/new payload fields bypass the boundary.
 */
object PushRecipientPolicy {
    private val recipientKeys = listOf(
        "recipient_user_id",
        "user_id",
        "recipient_id",
        "callee_id",
    )

    private val addressedEvents = setOf(
        "message",
        "group",
        "group_message",
        "call",
        "incoming_call",
        "call_cancel",
        "call_ended",
        "missed_call",
        "friend_request",
        "friend_accepted",
        "friend",
    )

    fun canDisplay(activeUserId: String?, data: Map<String, String>): Boolean {
        val owner = activeUserId?.takeIf { it.isNotBlank() } ?: return false
        val recipientValues = recipientKeys.mapNotNull { key ->
            data[key]?.trim()?.takeIf(String::isNotBlank)
        }
        if (recipientValues.any { it != owner }) return false
        return recipientValues.isNotEmpty() || data["type"].orEmpty() !in addressedEvents
    }
}
