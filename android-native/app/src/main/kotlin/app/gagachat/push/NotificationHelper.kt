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
 * Builds and posts message/call notifications (PDF §8). Tapping a notification
 * opens [MainActivity] with a deep link so the nav host routes to the right
 * conversation or call surface.
 */
object NotificationHelper {

    fun showMessage(
        context: Context,
        conversationId: String,
        title: String,
        body: String,
        notificationId: Int = conversationId.hashCode(),
    ) {
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

        val notification = NotificationCompat.Builder(context, NotificationChannels.MESSAGES)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pending)
            .build()

        post(context, notificationId, notification)
    }

    fun showIncomingCall(
        context: Context,
        conversationId: String,
        callerName: String,
        isVideo: Boolean,
        notificationId: Int = conversationId.hashCode() + 1,
    ) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            data = android.net.Uri.parse("gagachat://call/$conversationId")
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
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()

        post(context, notificationId, notification)
    }

    private fun post(context: Context, id: Int, notification: android.app.Notification) {
        val manager = NotificationManagerCompat.from(context)
        if (manager.areNotificationsEnabled()) {
            runCatching { manager.notify(id, notification) }
        }
    }

    @Suppress("unused")
    private fun systemManager(context: Context): NotificationManager? =
        context.getSystemService(NotificationManager::class.java)
}
