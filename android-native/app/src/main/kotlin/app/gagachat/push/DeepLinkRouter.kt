package app.gagachat.push

import android.content.Intent
import android.net.Uri
import app.gagachat.feature.calls.navigation.CallRoutes

/**
 * Translates incoming intents and push payloads into in-app navigation routes
 * (PDF §8 — deep links / notification routing). Supported forms:
 *
 *  - gagachat://chat/<conversationId>                          → the exact chat room
 *  - gagachat://call/<conversationId>?callId=<id>&video=<b>   → the incoming-call surface
 *  - gagachat://call/<conversationId>                          → the Calls tab
 *  - gagachat://calls                                          → the Calls tab (missed calls)
 *  - gagachat://requests                                       → the People screen (friend requests)
 *  - gagachat://profile/<userId>                               → a user profile
 *  - gagachat://security                                       → Security settings
 *  - https://gagachat.app/chat/<id>                            → same as the gagachat scheme
 *
 * The rule is that a tap never simply opens Home: it resolves to the exact
 * destination the notification is about.
 *
 * ## Calls never originate from a link
 *
 * A call link can only ever open the *incoming* call surface, never the
 * outgoing one. Opening the active-call route from a link would place a call
 * the user never asked for (and, before the LiveKit migration, would have rung
 * the other party back). Without a call id there is nothing to answer, so the
 * link degrades to the Calls tab instead.
 */
object DeepLinkRouter {

    private const val SCHEME = "gagachat"
    private const val WEB_HOST = "gagachat.app"
    private const val AUTH_CALLBACK = "auth-callback"

    /** Parses an [Intent] and stores any resulting route as pending. */
    fun capture(intent: Intent?) {
        val data = intent?.data ?: return
        // Emailed auth links return to the app as https://gagachat.app/auth-callback
        // with the session in the URL fragment; hand those to the auth shell.
        if (isAuthCallback(data)) {
            parseAuthCallback(data)?.let(PendingAuthLink::set)
            return
        }
        routeFor(data)?.let(PendingDeepLink::set)
    }

    /** True for the emailed auth callback App Link (`.../auth-callback`). */
    private fun isAuthCallback(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host == WEB_HOST && uri.pathSegments.firstOrNull() == AUTH_CALLBACK

    /**
     * Parses the tokens Supabase appends to the redirect as a URL fragment
     * (`#access_token=...&refresh_token=...&expires_in=...&type=magiclink`).
     */
    private fun parseAuthCallback(uri: Uri): AuthCallback? {
        val fragment = uri.fragment ?: return null
        val params = fragment.split("&")
            .mapNotNull { item -> item.split("=", limit = 2).takeIf { it.size == 2 }?.let { it[0] to it[1] } }
            .toMap()
        val access = params["access_token"] ?: return null
        val refresh = params["refresh_token"] ?: return null
        val expires = params["expires_in"]?.toLongOrNull() ?: 3600L
        val type = params["type"] ?: "magiclink"
        return AuthCallback(access, refresh, expires, type)
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
            "call", "incoming_call" -> {
                val callId = data["callId"] ?: data["call_id"]
                if (conversationId != null && !callId.isNullOrBlank()) {
                    CallRoutes.incomingCall(conversationId, callId, isVideo)
                } else {
                    "calls"
                }
            }
            "missed_call" -> "calls"
            "friend_request", "friend_accepted", "friend" -> "people"
            "security" -> "settings/security"
            "app_update" -> "settings/app-update"
            "group", "group_message" -> conversationId?.let { "chat/$it" }
            else -> conversationId?.let { "chat/$it" }
        }
    }

    /**
     * Resolves a call link into the incoming-call route, or the Calls tab when
     * the link does not carry enough information to answer anything.
     */
    private fun incomingCallRoute(uri: Uri, conversationId: String?): String {
        if (conversationId.isNullOrBlank()) return "calls"
        val callId = uri.getQueryParameter(CallRoutes.ARG_CALL_ID)
            ?: uri.getQueryParameter("call_id")
        if (callId.isNullOrBlank()) return "calls"
        val isVideo = uri.getQueryParameter("video").equals("true", ignoreCase = true)
            || uri.getQueryParameter("callType") == "video"
            || uri.getQueryParameter("call_type") == "video"
        return CallRoutes.incomingCall(conversationId, callId, isVideo)
    }

    private fun routeFor(uri: Uri): String? {
        val segments = uri.pathSegments
        return when {
            uri.scheme == SCHEME -> when (uri.host) {
                "chat" -> segments.firstOrNull()?.let { "chat/$it" }
                "call" -> incomingCallRoute(uri, segments.firstOrNull())
                "calls" -> "calls"
                "today" -> "daily"
                "app-update" -> "settings/app-update"
                "requests", "friends" -> "people"
                "security" -> "settings/security"
                "settings" -> segments.firstOrNull()?.let { "settings/$it" } ?: "settings"
                "profile" -> segments.firstOrNull()?.let { "profile?userId=$it" } ?: "profile"
                else -> null
            }
            uri.scheme == "https" && uri.host == WEB_HOST -> {
                when (segments.firstOrNull()) {
                    "chat" -> segments.getOrNull(1)?.let { "chat/$it" }
                    "call" -> incomingCallRoute(uri, segments.getOrNull(1))
                    "calls" -> "calls"
                    "app-update" -> "settings/app-update"
                    "requests" -> "people"
                    "profile" -> segments.getOrNull(1)?.let { "profile?userId=$it" } ?: "profile"
                    else -> null
                }
            }
            else -> null
        }
    }
}
