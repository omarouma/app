package app.gagachat.push

import android.content.Intent
import android.net.Uri

/**
 * Translates incoming intents and push payloads into in-app navigation routes
 * (PDF §8 — deep links / notification routing). Supported forms:
 *
 *  - gagachat://chat/<conversationId>      → the exact chat room
 *  - gagachat://call/<conversationId>      → the active-call surface
 *  - gagachat://calls                      → the Calls tab (missed calls)
 *  - gagachat://requests                   → the People screen (friend requests)
 *  - gagachat://profile/<userId>           → a user profile
 *  - gagachat://security                   → Security settings
 *  - https://gagachat.app/chat/<id>        → same as the gagachat scheme
 *
 * The rule is that a tap never simply opens Home: it resolves to the exact
 * destination the notification is about.
 */
object DeepLinkRouter {

    private const val SCHEME = "gagachat"
    private const val WEB_HOST = "gagachat.app"

    /** Parses an [Intent] and stores any resulting route as pending. */
    fun capture(intent: Intent?) {
        val data = intent?.data ?: return
        routeFor(data)?.let(PendingDeepLink::set)
    }

    /** Builds a route from a push data payload (FCM `data` map). */
    fun routeForPush(data: Map<String, String>): String? {
        val conversationId = data["conversationId"]
            ?: data["conversation_id"]
            ?: data["chatId"]
            ?: data["chat_id"]
        val type = data["type"]
        val isVideo = data["callType"] == "video"
            || data["call_type"] == "video"
            || data["is_video"].equals("true", ignoreCase = true)
        return when (type) {
            "call", "incoming_call" -> "calls"
            "missed_call" -> "calls"
            "friend_request", "friend_accepted", "friend" -> "people"
            "security" -> "settings/security"
            "group", "group_message" -> conversationId?.let { "chat/$it" }
            else -> conversationId?.let { "chat/$it" }
        }
    }

    private fun callRoute(conversationId: String, isVideo: Boolean): String =
        "calls" // Incoming/deep-linked calls must never originate a new outgoing call.

    private fun routeFor(uri: Uri): String? {
        val segments = uri.pathSegments
        return when {
            uri.scheme == SCHEME -> when (uri.host) {
                "chat" -> segments.firstOrNull()?.let { "chat/$it" }
                "call" -> segments.firstOrNull()?.let { callRoute(it, false) } ?: "calls"
                "calls" -> "calls"
                "requests", "friends" -> "people"
                "security" -> "settings/security"
                "settings" -> segments.firstOrNull()?.let { "settings/$it" } ?: "settings"
                "profile" -> segments.firstOrNull()?.let { "profile?userId=$it" } ?: "profile"
                else -> null
            }
            uri.scheme == "https" && uri.host == WEB_HOST -> {
                when (segments.firstOrNull()) {
                    "chat" -> segments.getOrNull(1)?.let { "chat/$it" }
                    "call" -> segments.getOrNull(1)?.let { callRoute(it, false) } ?: "calls"
                    "calls" -> "calls"
                    "requests" -> "people"
                    "profile" -> segments.getOrNull(1)?.let { "profile?userId=$it" } ?: "profile"
                    else -> null
                }
            }
            else -> null
        }
    }
}
