package app.gagachat.push

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.gagachat.MainActivity
import app.gagachat.R

/**
 * Builds and posts message/call notifications (PDF §8 / Master Spec §C).
 *
 * Every post is gated on the user's notification preference and the message
 * sound preference, so the in-app switches are real (not decorative). Tapping a
 * notification opens [MainActivity] with a deep link so the nav host routes to
 * the exact conversation, call or profile surface.
 */
object NotificationHelper {

    /**
     * Direct or group message notification.
     *
     * @param soundEnabled when false the notification is posted silently (the
     *   user turned off "Message sounds").
     */
    fun showMessage(
        context: Context,
        conversationId: String,
        title: String,
        body: String,
        isGroup: Boolean = false,
        soundEnabled: Boolean = true,
        notificationsEnabled: Boolean = true,
        notificationId: Int = conversationId.hashCode(),
    ) {
        if (!notificationsEnabled) return
        val channel = if (isGroup) NotificationChannels.GROUP_MESSAGES else NotificationChannels.MESSAGES
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            data = android.net.Uri.parse("gagachat://chat/$conversationId")
        }
        val pending = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(NotificationCompat.Builder(context, channel).setSmallIcon(R.drawable.ic_notification).setContentTitle("GaGa Chat").setContentText("Open GaGa to view").build())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setCategory(if (isGroup) NotificationCompat.CATEGORY_SOCIAL else NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pending)
            .setGroup(GROUP_KEY_MESSAGES)
        if (!soundEnabled) builder.setSilent(true)

        post(context, notificationId, builder.build())
    }

    /**
     * Incoming call — always uses the ringing channel and bypasses DND.
     *
     * [callId] is the server-side call row id. It is what lets a tap land on the
     * *incoming* call surface with enough information to actually accept the
     * call: the screen then asks the `livekit-token` Edge Function for its own
     * LiveKit access token. No credential is ever carried in the notification.
     */
    fun showIncomingCall(
        context: Context,
        conversationId: String,
        callerName: String,
        isVideo: Boolean,
        callId: String? = null,
        notificationsEnabled: Boolean = true,
        notificationId: Int = conversationId.hashCode() + 1,
    ) {
        if (!notificationsEnabled) return
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            data = android.net.Uri.parse(incomingCallUri(conversationId, callId, isVideo))
        }
        val pending = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val kind = if (isVideo) "Video call" else "Voice call"
        val notification = NotificationCompat.Builder(context, NotificationChannels.CALLS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(callerName)
            .setContentText("Incoming $kind")
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setTimeoutAfter(45_000L)
            .setAutoCancel(true)
            .setFullScreenIntent(pending, true)
            .setContentIntent(pending)
            .build()

        post(context, notificationId, notification)
    }

    /**
     * Deep link for an incoming call:
     * `gagachat://call/<conversationId>?callId=<id>&video=<bool>`.
     *
     * The call id and media kind travel as query parameters so the incoming-call
     * route can be rebuilt without another network round-trip. When [callId] is
     * missing the bare link is used, which the router deliberately resolves to
     * the Calls tab rather than to a call screen that could not be answered.
     */
    private fun incomingCallUri(conversationId: String, callId: String?, isVideo: Boolean): String {
        val base = "gagachat://call/${android.net.Uri.encode(conversationId)}"
        if (callId.isNullOrBlank()) return base
        return "$base?callId=${android.net.Uri.encode(callId)}&video=$isVideo"
    }

    /** Missed call notification; tapping opens the Calls tab. */
    fun showMissedCall(
        context: Context,
        conversationId: String,
        callerName: String,
        isVideo: Boolean,
        notificationsEnabled: Boolean = true,
        notificationId: Int = conversationId.hashCode() + 2,
    ) {
        if (!notificationsEnabled) return
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            data = android.net.Uri.parse("gagachat://calls")
        }
        val pending = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val kind = if (isVideo) "video call" else "voice call"
        val notification = NotificationCompat.Builder(context, NotificationChannels.MISSED_CALLS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Missed $kind")
            .setContentText(callerName)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pending)
            .build()

        post(context, notificationId, notification)
    }

    /**
     * Generic notification used for friend requests, accepted requests and
     * security alerts. [route] is an in-app route the tap should resolve to.
     */
    fun showGeneral(
        context: Context,
        id: Int,
        title: String,
        body: String,
        route: String? = null,
        security: Boolean = false,
        soundEnabled: Boolean = true,
        notificationsEnabled: Boolean = true,
    ) {
        if (!notificationsEnabled) return
        val channel = if (security) NotificationChannels.SECURITY else NotificationChannels.MESSAGES
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (route != null) data = android.net.Uri.parse("gagachat://$route")
        }
        val pending = PendingIntent.getActivity(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pending)
        if (!soundEnabled) builder.setSilent(true)

        post(context, id, builder.build())
    }

    private fun post(context: Context, id: Int, notification: android.app.Notification) {
        val manager = NotificationManagerCompat.from(context)
        if (manager.areNotificationsEnabled()) {
            runCatching { manager.notify(id, notification) }
        }
    }


    /** Cancels the deterministic incoming-call notification for a conversation. */
    fun cancelIncomingCall(context: Context, conversationId: String) {
        cancel(context, conversationId.hashCode() + 1)
    }

    /** Cancels a previously posted notification (e.g. an incoming call that ended). */
    fun cancel(context: Context, id: Int) {
        runCatching { NotificationManagerCompat.from(context).cancel(id) }
    }

    @Suppress("unused")
    private fun systemManager(context: Context): NotificationManager? =
        context.getSystemService(NotificationManager::class.java)

    private const val GROUP_KEY_MESSAGES = "gaga_messages_group"
}
