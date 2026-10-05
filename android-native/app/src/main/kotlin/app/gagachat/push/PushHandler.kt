package app.gagachat.push

import android.content.Context
import app.gagachat.core.data.preferences.SettingsPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Turns an inbound FCM `data` payload into the right notification (PDF \u00a78 /
 * Master Spec \u00a7C \u2014 notifications).
 *
 * This is the single place that decides *what* a push looks like; the transport
 * that delivered it ([GagaFirebaseMessagingService]) stays deliberately thin.
 * Keeping the routing here also means the logic is unit-testable without an
 * Android service, and that a future transport (e.g. a WorkManager-driven
 * fallback) can reuse it unchanged.
 *
 * Every notification respects the user's in-app preferences: if notifications
 * are disabled nothing is posted, and if message sounds are disabled the message
 * notification is silent. Nothing here touches the database directly \u2014 it only
 * posts notifications and records the pending deep link so the UI can react when
 * it comes to the foreground.
 *
 * ## Call pushes and LiveKit
 *
 * LiveKit is a pure media transport and has no concept of "ring this phone", so
 * the incoming-call push is what wakes a backgrounded or killed app. It is sent
 * by `create-call` / `send-fcm-push` as a *data-only* message, which is why
 * the payload (not the notification block) is authoritative here. The tap
 * deep-links into the incoming-call surface, which then asks the server for its
 * own LiveKit access token \u2014 no credential ever travels in the push.
 */
@Singleton
class PushHandler @Inject constructor(
    @ApplicationContext private val context: Context,
    private val settingsPreferences: SettingsPreferences,
    private val sessionStore: app.gagachat.core.network.session.SessionStore,
    private val privacyApi: app.gagachat.core.network.rest.SupabaseRestApi,
) {

    /**
     * Routes one push. [notificationTitle]/[notificationBody] are the optional
     * `notification` block values, used only as a fallback when the data payload
     * does not carry its own title/body.
     */
    suspend fun handle(
        data: Map<String, String>,
        notificationTitle: String? = null,
        notificationBody: String? = null,
    ) {
        val currentUser = sessionStore.userId() ?: return
        val recipient = data["user_id"] ?: data["callee_id"] ?: data["recipient_id"]
        if (recipient != null && recipient != currentUser) return
        val preview = settingsPreferences.notificationPreview.first()
        val locked = settingsPreferences.appLockEnabled.first()
        val notificationsEnabled = settingsPreferences.notificationsEnabled.first()
        val soundsEnabled = settingsPreferences.messageSoundsEnabled.first()

        val type = data["type"]
        val conversationId = data["conversationId"]
            ?: data["conversation_id"]
            ?: data["chatId"]
            ?: data["chat_id"]
        val callId = data["callId"] ?: data["call_id"]
        val callerName = data["callerName"] ?: data["caller_name"]
        val rawTitle = data["title"] ?: callerName ?: notificationTitle ?: "GaGa Chat"
        val title = if (locked || preview == app.gagachat.core.data.preferences.NotificationPreview.NONE) "GaGa Chat" else rawTitle
        val body = if (!locked && preview == app.gagachat.core.data.preferences.NotificationPreview.FULL) data["body"] ?: data["message_preview"] ?: notificationBody ?: "New message" else "Open GaGa to view"
        val isVideo = data["callType"] == "video"
            || data["call_type"] == "video"
            || data["is_video"].equals("true", ignoreCase = true)
        val isGroup = data["isGroup"] == "true" || type == "group" || type == "group_message"

        when (type) {
            "call", "incoming_call" -> {
                if (callId == null || !runCatching { privacyApi.validateIncomingCall(callId, data["caller_id"] ?: data["callerId"]) }.getOrDefault(false)) return
                if (conversationId != null) {
                    NotificationHelper.showIncomingCall(
                        context = context,
                        conversationId = conversationId,
                        callId = callId,
                        callerName = title,
                        isVideo = isVideo,
                        notificationsEnabled = notificationsEnabled,
                    )
                }
            }

            "call_cancel", "call_ended" -> {
                conversationId?.let { NotificationHelper.cancelIncomingCall(context, it) }
            }

            "missed_call" -> {
                NotificationHelper.showMissedCall(
                    context = context,
                    conversationId = conversationId ?: title,
                    callerName = title,
                    isVideo = isVideo,
                    notificationsEnabled = notificationsEnabled,
                )
            }

            "friend_request", "friend_accepted", "friend" -> {
                NotificationHelper.showGeneral(
                    context = context,
                    id = (conversationId ?: title).hashCode(),
                    title = title,
                    body = body,
                    route = "requests",
                    soundEnabled = soundsEnabled,
                    notificationsEnabled = notificationsEnabled,
                )
            }

            "security" -> {
                NotificationHelper.showGeneral(
                    context = context,
                    id = (data["id"] ?: title).hashCode(),
                    title = title,
                    body = body,
                    route = "security",
                    security = true,
                    soundEnabled = true,
                    notificationsEnabled = notificationsEnabled,
                )
            }

            else -> {
                if (conversationId != null) {
                    NotificationHelper.showMessage(
                        context = context,
                        conversationId = conversationId,
                        title = title,
                        body = body,
                        isGroup = isGroup,
                        soundEnabled = soundsEnabled,
                        notificationsEnabled = notificationsEnabled,
                    )
                }
            }
        }
    }
}
