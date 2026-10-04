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
 * The app's FCM entry point (PDF \u00a78 / Master Spec \u00a7C \u2014 notifications).
 *
 * Before the LiveKit migration this role belonged to ZEGOCLOUD: its Call Kit
 * shipped the `FirebaseMessagingService` and forwarded ordinary app pushes to
 * the app through a private broadcast action. Removing ZEGO therefore meant
 * taking ownership of the FCM service itself, which is what this class is.
 *
 * It stays intentionally thin \u2014 all routing lives in [PushHandler] \u2014 and only
 * does two things: hand each message to the handler, and keep the device token
 * registered against the signed-in user.
 *
 * Both callbacks are dispatched onto an IO scope rather than blocking the
 * service thread: `onMessageReceived` runs on the main thread, and the handler
 * performs a DataStore read plus a notification post.
 */
@AndroidEntryPoint
class GagaFirebaseMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var pushHandler: PushHandler

    @Inject
    lateinit var tokenRegistrar: PushTokenRegistrar

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * Handles every message, including the data-only incoming-call push sent by
     * the `livekit-token` Edge Function. A data-only message never auto-posts a
     * notification, so it is essential that the call path is handled here \u2014
     * otherwise a backgrounded device would never ring.
     */
    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val title = message.notification?.title
        val body = message.notification?.body
        scope.launch {
            runCatching { pushHandler.handle(data = data, notificationTitle = title, notificationBody = body) }
        }
    }

    /**
     * FCM rotates tokens at will, so re-bind the new one to the current device
     * row immediately. [PushTokenRegistrar] no-ops when nobody is signed in; the
     * login path re-registers the current token as a safety net.
     */
    override fun onNewToken(token: String) {
        if (token.isBlank()) return
        scope.launch { runCatching { tokenRegistrar.register(token) } }
    }
}
