package app.gagachat.core.data.media

import android.content.Context
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.media.AudioManager
import android.app.NotificationManager
import android.os.SystemClock
import app.gagachat.core.data.preferences.SettingsPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Plays the short in-app message tone while GaGa is foregrounded (Master Spec
 * §C — message sounds).
 *
 * This is intentionally separate from the FCM notification sound: when the app
 * is open there is no notification, so the tone must be played by the app itself.
 * The user's "Message sounds" preference is honoured on every call, and the tone
 * is played on the notification audio stream so it respects the device's silent /
 * vibrate / DND state.
 */
@Singleton
class GagaSoundPlayer @Inject constructor(
    @ApplicationContext private val context: Context,
    private val settingsPreferences: SettingsPreferences,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var current: Ringtone? = null
    private var lastToneAt = 0L

    fun playMessageSound() {
        scope.launch {
            if (!settingsPreferences.messageSoundsEnabled.first()) return@launch
            runCatching {
                val audio = context.getSystemService(AudioManager::class.java) ?: return@runCatching
                val notifications = context.getSystemService(NotificationManager::class.java)
                if (audio.ringerMode != AudioManager.RINGER_MODE_NORMAL ||
                    (notifications != null && notifications.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL)) return@runCatching
                val now = SystemClock.elapsedRealtime()
                if (lastToneAt != 0L && now - lastToneAt < 800L) return@runCatching
                lastToneAt = now
                current?.stop()
                val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                val ringtone = RingtoneManager.getRingtone(context, uri) ?: return@runCatching
                ringtone.audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                current = ringtone
                ringtone.play()
            }
        }
    }
}
