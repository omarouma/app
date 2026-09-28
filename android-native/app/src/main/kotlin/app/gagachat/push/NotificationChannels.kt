package app.gagachat.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build

/**
 * Notification channels (PDF §8 / Master Spec §C — notifications).
 *
 * Each event family gets its own channel so users can mute one without the
 * others, matching the final product structure:
 *
 *   GaGa Notifications
 *   ├── Messages
 *   ├── Group Messages
 *   ├── Incoming Calls
 *   ├── Missed Calls
 *   └── Important / Security
 *
 * Incoming calls use a high-importance channel that bypasses Do-Not-Disturb (like
 * a real phone call) and carries the system ringtone. The channel ids are stable
 * — changing them would orphan a user's existing notification preferences.
 */
object NotificationChannels {
    const val MESSAGES = "gaga_messages"
    const val GROUP_MESSAGES = "gaga_group_messages"
    const val CALLS = "gaga_calls"
    const val MISSED_CALLS = "gaga_missed_calls"
    const val SECURITY = "gaga_security"

    /** Retained for backwards compatibility with older installs. */
    const val GENERAL = "gaga_general"

    fun createAll(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        val defaultSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val soundAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        manager.createNotificationChannel(
            NotificationChannel(
                MESSAGES,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "New direct chat messages"
                enableVibration(true)
                setSound(defaultSound, soundAttrs)
            },
        )

        manager.createNotificationChannel(
            NotificationChannel(
                GROUP_MESSAGES,
                "Group Messages",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "New group chat messages"
                enableVibration(true)
                setSound(defaultSound, soundAttrs)
            },
        )

        manager.createNotificationChannel(
            NotificationChannel(
                CALLS,
                "Incoming Calls",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Incoming voice and video calls"
                enableVibration(true)
                setBypassDnd(true)
                setSound(
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
            },
        )

        manager.createNotificationChannel(
            NotificationChannel(
                MISSED_CALLS,
                "Missed Calls",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Missed voice and video calls"
                enableVibration(true)
                setSound(defaultSound, soundAttrs)
            },
        )

        manager.createNotificationChannel(
            NotificationChannel(
                SECURITY,
                "Important / Security",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Account, login and security alerts"
                enableVibration(true)
                setSound(defaultSound, soundAttrs)
            },
        )

        // Legacy channel kept so existing preferences are not orphaned.
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
