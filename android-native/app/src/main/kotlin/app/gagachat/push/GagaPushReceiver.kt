package app.gagachat.push

import app.gagachat.core.data.preferences.SettingsPreferences
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * FCM entry point (PDF §8 / Master Spec §C — notifications). Routes message,
 * group, call, missed-call, friend and security pushes to the correct surface
 * and keeps the device token registered.
 *
 * Every notification respects the user's in-app preferences: if notifications
 * are disabled nothing is posted, and if message sounds are disabled the message
 * notification is silent. The service is intentionally thin: it never touches the
 * database directly, it only posts notifications and records the pending deep
 * link so the UI can react when it comes to the foreground.
 */
@AndroidEntryPoint
class GagaPushReceiver : BroadcastReceiver() {

    @Inject
    lateinit var tokenRegistrar: PushTokenRegistrar

    @Inject
    lateinit var settingsPreferences: SettingsPreferences

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Suppress("DEPRECATION")
    override fun onReceive(context: Context, intent: Intent) {
        val message = intent.getParcelableExtra<RemoteMessage>("remoteMessage") ?: return
        val pending = goAsync()
        val data = message.data
        val type = data["type"]

        // Navigation is captured only from a notification tap, never on receipt.

        scope.launch {
          try {
            val notificationsEnabled = settingsPreferences.notificationsEnabled.first()
            val soundsEnabled = settingsPreferences.messageSoundsEnabled.first()

            val conversationId = data["conversationId"]
                ?: data["conversation_id"]
                ?: data["chatId"]
                ?: data["chat_id"]
            val callerName = data["callerName"]
                ?: data["caller_name"]
            val title = data["title"]
                ?: callerName
                ?: message.notification?.title
                ?: "GaGa Chat"
            val body = data["body"]
                ?: data["message_preview"]
                ?: message.notification?.body
                ?: "New message"
            val isVideo = data["callType"] == "video"
                || data["call_type"] == "video"
                || data["is_video"].equals("true", ignoreCase = true)
            val isGroup = data["isGroup"] == "true" || type == "group" || type == "group_message"

            when (type) {
                "call", "incoming_call" -> {
                    if (conversationId != null) {
                        NotificationHelper.showIncomingCall(
                            context = context,
                            conversationId = conversationId,
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
          } finally { pending.finish() }
        }
    }
}
