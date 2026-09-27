package app.gagachat.push

import android.content.Intent
import android.net.Uri

/**
 * Translates incoming intents and push payloads into in-app navigation routes
 * (PDF §8 — deep links). Supported forms:
 *
 *  - gagachat://chat/<conversationId>
 *  - gagachat://call/<conversationId>
 *  - gagachat://profile/<userId>
 *  - https://oumagachat.web.app/chat/<conversationId>
 */
object DeepLinkRouter {

    private const val SCHEME = "gagachat"
    private const val WEB_HOST = "oumagachat.web.app"

    /** Parses an [Intent] and stores any resulting route as pending. */
    fun capture(intent: Intent?) {
        val data = intent?.data ?: return
        routeFor(data)?.let(PendingDeepLink::set)
    }

    /** Builds a route from a push data payload (FCM `data` map). */
    fun routeForPush(data: Map<String, String>): String? {
        val conversationId = data["conversationId"] ?: data["conversation_id"]
        val type = data["type"]
        val isVideo = data["callType"] == "video"
        return when {
            type == "call" && conversationId != null -> callRoute(conversationId, isVideo)
            conversationId != null -> "chat/$conversationId"
            else -> null
        }
    }

    private fun callRoute(conversationId: String, isVideo: Boolean): String =
        "call/active?conversationId=$conversationId&video=$isVideo"

    private fun routeFor(uri: Uri): String? {
        val segments = uri.pathSegments
        return when {
            uri.scheme == SCHEME -> when (uri.host) {
                "chat" -> segments.firstOrNull()?.let { "chat/$it" }
                "call" -> segments.firstOrNull()?.let { callRoute(it, false) } ?: "call/active"
                "profile" -> segments.firstOrNull()?.let { "profile?userId=$it" } ?: "profile"
                else -> null
            }
            uri.scheme == "https" && uri.host == WEB_HOST -> {
                when (segments.firstOrNull()) {
                    "chat" -> segments.getOrNull(1)?.let { "chat/$it" }
                    "call" -> segments.getOrNull(1)?.let { callRoute(it, false) } ?: "call/active"
                    "profile" -> segments.getOrNull(1)?.let { "profile?userId=$it" } ?: "profile"
                    else -> null
                }
            }
            else -> null
        }
    }
}
