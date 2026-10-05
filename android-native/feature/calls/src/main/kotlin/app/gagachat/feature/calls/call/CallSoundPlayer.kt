package app.gagachat.feature.calls.call

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.data.preferences.SettingsPreferences
import app.gagachat.feature.calls.R
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/** Which call tone is currently requested. */
enum class CallTone { INCOMING, OUTGOING }

/**
 * Owns the **audible** side of a call: the looping incoming ringtone, the
 * outgoing ringback, and the call vibration pattern.
 *
 * This is the piece that was missing entirely — the app previously relied on the
 * notification-channel sound, which (a) does not play while the app is in the
 * foreground, (b) fires only once instead of ringing, and (c) does not exist for
 * an outgoing call at all, so a caller heard nothing while the callee's phone
 * rang. Bundling the tones and driving them from the call lifecycle makes the
 * ring independent of the device's chosen ringtone (which some ROMs leave unset)
 * while still respecting the ringer stream, silent/vibrate mode and the user's
 * in-app preferences.
 *
 * All state transitions are idempotent and funnelled through [start]/[stop] so a
 * tone can never be left playing after its call becomes inactive.
 */
@Singleton
class CallSoundPlayer @Inject constructor(
    @ApplicationContext private val context: Context,
    private val settingsPreferences: SettingsPreferences,
    private val logger: AppLogger,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val audioManager: AudioManager? = context.getSystemService(AudioManager::class.java)

    private var player: MediaPlayer? = null
    private var focusRequest: AudioFocusRequest? = null

    /** The tone currently requested, or `null` when nothing should be ringing. */
    @Volatile
    private var active: CallTone? = null

    /** Starts the looping incoming ringtone (no-op if already ringing). */
    fun startIncoming() = start(CallTone.INCOMING)

    /** Starts the looping outgoing ringback (no-op if already ringing). */
    fun startOutgoing() = start(CallTone.OUTGOING)

    /**
     * Stops every tone and the vibration. Safe to call at any time and any number
     * of times; a second call is a cheap no-op. This is the single choke point the
     * call lifecycle uses on accept / reject / cancel / expiry / connect / end.
     */
    fun stop() {
        active = null
        scope.launch { stopInternal() }
    }

    /** Full teardown for logout: stop everything and drop the scope's work. */
    fun release() {
        active = null
        stopInternal()
    }

    @Synchronized
    private fun start(tone: CallTone) {
        // Idempotent: re-entering the same ringing phase (recomposition, a second
        // invite for the same call) must not stack a second MediaPlayer.
        if (active == tone) return
        active = tone
        scope.launch { play(tone) }
    }

    private suspend fun play(tone: CallTone) {
        // The tone may have been superseded (e.g. the user accepted) between the
        // request and this coroutine running.
        if (active != tone) return
        stopInternal()

        val soundsEnabled = runCatching { settingsPreferences.callSoundsEnabled.first() }
            .getOrDefault(true)
        val vibrationEnabled = runCatching { settingsPreferences.callVibrationEnabled.first() }
            .getOrDefault(true)

        val ringerMode = audioManager?.ringerMode ?: AudioManager.RINGER_MODE_NORMAL
        val silent = ringerMode == AudioManager.RINGER_MODE_SILENT
        val vibrateOnly = ringerMode == AudioManager.RINGER_MODE_VIBRATE

        if (soundsEnabled && !silent && !vibrateOnly) {
            requestAudioFocus()
            startMediaPlayer(tone)
        }
        if (vibrationEnabled && !silent) {
            startVibration()
        }
    }

    private fun startMediaPlayer(tone: CallTone) {
        runCatching {
            val resId = if (tone == CallTone.INCOMING) R.raw.gaga_ringtone else R.raw.gaga_ringback
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val mp = MediaPlayer.create(
                context,
                resId,
                attrs,
                AudioManager.AUDIO_SESSION_ID_GENERATE,
            ) ?: return
            mp.isLooping = true
            mp.start()
            player = mp
        }.onFailure { t ->
            logger.w("CallSoundPlayer", "Could not start ${tone.name} tone", t)
        }
    }

    private fun requestAudioFocus() {
        val am = audioManager ?: return
        runCatching {
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener { change ->
                    // If anything else needs audio (another call, an alarm), stop
                    // ringing rather than fighting for the stream.
                    if (change == AudioManager.AUDIOFOCUS_LOSS ||
                        change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
                    ) {
                        stop()
                    }
                }
                .build()
            am.requestAudioFocus(request)
            focusRequest = request
        }
    }

    private fun startVibration() {
        runCatching {
            val vib = vibrator() ?: return
            // wait 0, buzz 900ms, pause 700ms — then repeat from the start.
            val pattern = longArrayOf(0L, 900L, 700L)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vib.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vib.vibrate(pattern, 0)
            }
        }.onFailure { t ->
            logger.w("CallSoundPlayer", "Could not start call vibration", t)
        }
    }

    private fun vibrator(): Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Vibrator::class.java)
        }

    @Synchronized
    private fun stopInternal() {
        runCatching {
            player?.let { mp ->
                if (mp.isPlaying) runCatching { mp.stop() }
                mp.release()
            }
        }
        player = null

        runCatching { vibrator()?.cancel() }

        focusRequest?.let { req -> runCatching { audioManager?.abandonAudioFocusRequest(req) } }
        focusRequest = null
    }
}
