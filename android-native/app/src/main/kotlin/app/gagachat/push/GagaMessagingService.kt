package app.gagachat.push

import app.gagachat.core.data.preferences.SettingsPreferences
import com.google.firebase.messaging.FirebaseMessagingService
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
class GagaMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var tokenRegistrar: PushTokenRegistrar

    @Inject
    lateinit var settingsPreferences: SettingsPreferences

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        scope.launch { tokenRegistrar.register(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data
        val type = data["type"]

        // Record the deep link so a tap routes correctly even from cold start.
        DeepLinkRouter.routeForPush(data)?.let(PendingDeepLink::set)

        scope.launch {
            val notificationsEnabled = settingsPreferences.notificationsEnabled.first()
            val soundsEnabled = settingsPreferences.messageSoundsEnabled.first()

            val conversationId = data["conversationId"] ?: data["conversation_id"]
            val title = data["title"] ?: message.notification?.title ?: "GaGa Chat"
            val body = data["body"] ?: message.notification?.body ?: "New message"
            val isVideo = data["callType"] == "video"
            val isGroup = data["isGroup"] == "true" || type == "group" || type == "group_message"

            when (type) {
                "call", "incoming_call" -> {
                    if (conversationId != null) {
                        NotificationHelper.showIncomingCall(
                            context = this@GagaMessagingService,
                            conversationId = conversationId,
                            callerName = title,
                            isVideo = isVideo,
                            notificationsEnabled = notificationsEnabled,
                        )
                    }
                }

                "missed_call" -> {
                    NotificationHelper.showMissedCall(
                        context = this@GagaMessagingService,
                        conversationId = conversationId ?: title,
                        callerName = title,
                        isVideo = isVideo,
                        notificationsEnabled = notificationsEnabled,
                    )
                }

                "friend_request", "friend_accepted", "friend" -> {
                    NotificationHelper.showGeneral(
                        context = this@GagaMessagingService,
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
                        context = this@GagaMessagingService,
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
                            context = this@GagaMessagingService,
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
}
