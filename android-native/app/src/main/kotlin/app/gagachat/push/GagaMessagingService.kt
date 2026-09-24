package app.gagachat.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * FCM entry point (PDF §8). Routes message and call pushes to the correct
 * surface and keeps the device token registered. The service is intentionally
 * thin: it never touches the database directly, it only posts notifications and
 * records the pending deep link so the UI can react when it comes to the
 * foreground.
 */
@AndroidEntryPoint
class GagaMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var tokenRegistrar: PushTokenRegistrar

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

        val conversationId = data["conversationId"] ?: data["conversation_id"] ?: return
        val title = data["title"] ?: message.notification?.title ?: "GaGa Chat"
        val body = data["body"] ?: message.notification?.body ?: "New message"

        if (type == "call") {
            NotificationHelper.showIncomingCall(
                context = this,
                conversationId = conversationId,
                callerName = title,
                isVideo = data["callType"] == "video",
            )
        } else {
            NotificationHelper.showMessage(
                context = this,
                conversationId = conversationId,
                title = title,
                body = body,
            )
        }
    }
}
