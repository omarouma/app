package app.gagachat.core.model

/**
 * Device-local foreground message sound gate.
 *
 * Notification sounds are not delivery receipts: disabling a tone must never
 * prevent a message from reaching the inbox or being marked as delivered.
 * This check is also intentionally separate from Android's system channel
 * sound, which users configure in the OS.
 */
object NotificationSoundPolicy {
    fun mayPlayMessageTone(
        notificationsEnabled: Boolean,
        categoryEnabled: Boolean,
        soundsEnabled: Boolean,
        isMuted: Boolean,
    ): Boolean =
        notificationsEnabled && categoryEnabled && soundsEnabled && !isMuted
}
