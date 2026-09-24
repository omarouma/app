package app.gagachat.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

/**
 * Notification channels (PDF §8). Messages and calls are separated so users can
 * mute one without the other; calls use a high-importance channel with sound.
 */
object NotificationChannels {
    const val MESSAGES = "gaga_messages"
    const val CALLS = "gaga_calls"
    const val GENERAL = "gaga_general"

    fun createAll(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        manager.createNotificationChannel(
            NotificationChannel(
                MESSAGES,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "New chat messages"
                enableVibration(true)
            },
        )

        manager.createNotificationChannel(
            NotificationChannel(
                CALLS,
                "Calls",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Incoming voice and video calls"
                enableVibration(true)
                setBypassDnd(true)
            },
        )

        manager.createNotificationChannel(
            NotificationChannel(
                GENERAL,
                "General",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Account and app updates"
            },
        )
    }
}
