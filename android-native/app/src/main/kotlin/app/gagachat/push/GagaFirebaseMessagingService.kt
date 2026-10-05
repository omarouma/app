package app.gagachat.push

import app.gagachat.core.common.util.AppLogger
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
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
 * FCM invokes message handling on a worker thread. Finish the lightweight
 * DataStore read and notification post before returning, while FCM still keeps
 * the process alive. Token registration is also refreshed at app sign-in.
 */
@AndroidEntryPoint
class GagaFirebaseMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var pushHandler: PushHandler

    @Inject
    lateinit var tokenRegistrar: PushTokenRegistrar

    @Inject
    lateinit var logger: AppLogger

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * Handles every message, including the data-only incoming-call push sent by
     * the `create-call` / `send-fcm-push` Edge Functions. A data-only message never auto-posts a
     * notification, so it is essential that the call path is handled here \u2014
     * otherwise a backgrounded device would never ring.
     */
    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (data["type"] in setOf("call", "incoming_call")) {
            val payload = androidx.work.Data.Builder().putLong("received_at", System.currentTimeMillis()).apply { data.forEach { (key, value) -> putString(key, value) } }.build()
            val work = androidx.work.OneTimeWorkRequestBuilder<ValidatedCallPushWorker>().setInputData(payload)
                .setExpedited(androidx.work.OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST).build()
            androidx.work.WorkManager.getInstance(this).enqueueUniqueWork("call-push:" + (data["call_id"] ?: data["callId"] ?: message.messageId), androidx.work.ExistingWorkPolicy.KEEP, work)
            return
        }
        val title = message.notification?.title
        val body = message.notification?.body
        try {
            runBlocking {
                withTimeout(4_000L) {
                    pushHandler.handle(data = data, notificationTitle = title, notificationBody = body)
                }
            }
        } catch (error: Exception) {
            logger.w("GagaFCM", "Could not display push notification", error)
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
