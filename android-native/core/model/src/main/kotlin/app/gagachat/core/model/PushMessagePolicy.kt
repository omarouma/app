package app.gagachat.core.model

/**
 * Presentation policy for FCM message notifications.
 *
 * A locally cached chat preference must be respected when an FCM data message
 * arrives while the process is backgrounded. Unlike foreground chat banners,
 * FCM delivery does not pass through the chat screen's mute checks.
 *
 * The server remains authoritative for recipient access and the user's current
 * cross-device preferences. The cached state is a best-effort local safeguard,
 * not a substitute for server-side recipient filtering.
 */
object PushMessagePolicy {
    fun shouldDisplay(cachedMuted: Boolean?): Boolean = cachedMuted != true

    /**
     * Most existing FCM messages use type=message for both direct and group
     * conversations. Prefer the locally synced conversation type when known.
     * For a cold-cache push, allow a verified backend group hint as a fallback.
     */
    fun isGroup(cachedType: String?, data: Map<String, String>): Boolean =
        when (cachedType?.lowercase()) {
            "direct" -> false
            "group", "channel" -> true
            else -> data["isGroup"].equals("true", ignoreCase = true) ||
                data["is_group"].equals("true", ignoreCase = true) ||
                data["type"] in setOf("group", "group_message")
        }
}
