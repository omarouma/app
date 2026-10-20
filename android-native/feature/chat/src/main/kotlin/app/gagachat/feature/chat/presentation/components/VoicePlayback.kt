package app.gagachat.feature.chat.presentation.components

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Single-clip audio player for voice messages with a full transport model:
 * play/pause, seek, elapsed + total duration and an error/retry state. Prefers
 * the remote [mediaUrl] and falls back to the locally recorded file while an
 * upload is still in flight. Only one clip plays at a time per instance; the
 * underlying [MediaPlayer] is always released when the composable leaves
 * composition.
 *
 * The previous implementation only tracked a boolean `isPlaying`, so a sent
 * voice note had no scrubber, no elapsed/total time and no way to recover from a
 * decode error \u2014 the transport below fixes that (P0).
 */
class VoicePlayerState internal constructor(private val context: Context) {
    private var player: MediaPlayer? = null
    private val audioManager: AudioManager? = context.getSystemService(AudioManager::class.java)
    private var focusRequest: AudioFocusRequest? = null
    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        // Voice playback must not compete with incoming calls or alarms.
        if (change == AudioManager.AUDIOFOCUS_LOSS ||
            change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
        ) pause()
    }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var pollJob: Job? = null

    /** The source string currently bound to the player (null when idle). */
    var activeSource by mutableStateOf<String?>(null)
        private set

    var isPlaying by mutableStateOf(false)
        private set

    /** True between [toggle] and the first prepared frame (buffering). */
    var isPreparing by mutableStateOf(false)
        private set

    var positionMs by mutableStateOf(0L)
        private set

    var durationMs by mutableStateOf(0L)
        private set

    var error by mutableStateOf(false)
        private set

    /** Playback progress in 0f..1f (0 when the duration is unknown). */
    val progress: Float
        get() = if (durationMs <= 0L) 0f else (positionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f)

    /**
     * Toggles playback for [source]. A fresh source (or a retry after an error)
     * starts from the beginning; tapping the active, healthy clip pauses or
     * resumes it.
     */
    fun toggle(source: String?) {
        if (source.isNullOrBlank()) return
        val mp = player
        when {
            activeSource == source && mp != null && isPlaying -> pause()
            activeSource == source && mp != null && !error -> resume()
            else -> start(source)
        }
    }

    private fun start(source: String) {
        releasePlayer()
        error = false
        isPreparing = true
        positionMs = 0L
        durationMs = 0L
        activeSource = source
        val mp = MediaPlayer()
        try {
            // Route voice notes through the *media* stream with a speech content
            // type. Without explicit attributes the platform can pick an
            // earpiece/ring stream on some OEM builds, which is why voice notes
            // played "silently". Attributes MUST be set before prepare().
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            mp.setDataSource(source)
            mp.setOnPreparedListener {
                // Guard against a stale player that was released while buffering.
                if (player !== it) return@setOnPreparedListener
                isPreparing = false
                durationMs = runCatching { it.duration.toLong() }.getOrDefault(0L).coerceAtLeast(0L)
                if (!startWithAudioFocus(it)) {
                    fail()
                }
            }
            mp.setOnCompletionListener {
                if (player === it) {
                    isPlaying = false
                    positionMs = durationMs
                    stopPolling()
                    abandonAudioFocus()
                }
            }
            mp.setOnErrorListener { _, _, _ ->
                if (player === mp) fail()
                true
            }
            // Assign before prepareAsync so the OnPreparedListener can match it.
            player = mp
            mp.prepareAsync()
        } catch (t: Throwable) {
            runCatching { mp.release() }
            if (player === mp) player = null
            fail()
        }
    }

    private fun resume() {
        val mp = player ?: return
        if (!startWithAudioFocus(mp)) fail()
    }

    private fun startWithAudioFocus(mp: MediaPlayer): Boolean {
        if (!requestAudioFocus()) return false
        if (runCatching { mp.start() }.isFailure) {
            abandonAudioFocus()
            return false
        }
        isPlaying = true
        error = false
        startPolling()
        return true
    }

    private fun requestAudioFocus(): Boolean {
        val audio = audioManager ?: return false
        return runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build(),
                    )
                    .setOnAudioFocusChangeListener(focusListener)
                    .build()
                val granted = audio.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
                if (granted) focusRequest = request
                granted
            } else {
                @Suppress("DEPRECATION")
                audio.requestAudioFocus(
                    focusListener, AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
                ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            }
        }.getOrDefault(false)
    }

    private fun abandonAudioFocus() {
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focusRequest?.let { audioManager?.abandonAudioFocusRequest(it) }
                focusRequest = null
            } else {
                @Suppress("DEPRECATION")
                audioManager?.abandonAudioFocus(focusListener)
            }
        }
    }

    private fun pause() {
        player?.let { runCatching { it.pause() } }
        isPlaying = false
        stopPolling()
        abandonAudioFocus()
    }

    /** Seeks the active clip to [ms] (clamped to the known duration). */
    fun seekTo(ms: Long) {
        val mp = player ?: return
        val clamped = ms.coerceIn(0L, if (durationMs > 0L) durationMs else ms)
        runCatching { mp.seekTo(clamped.toInt()) }
        positionMs = clamped
    }

    private fun startPolling() {
        stopPolling()
        pollJob = scope.launch {
            while (isActive) {
                val mp = player
                if (mp == null || !isPlaying) break
                positionMs = runCatching { mp.currentPosition.toLong() }.getOrDefault(positionMs)
                delay(200)
            }
        }
    }

    private fun stopPolling() {
        pollJob?.cancel()
        pollJob = null
    }

    /** Marks the active clip as failed but keeps [activeSource] so the UI can retry. */
    private fun fail() {
        stopPolling()
        abandonAudioFocus()
        player?.let { runCatching { it.release() } }
        player = null
        isPlaying = false
        isPreparing = false
        error = true
    }

    fun stop() = releasePlayer()

    private fun releasePlayer() {
        stopPolling()
        abandonAudioFocus()
        player?.let { runCatching { it.stop() }; runCatching { it.release() } }
        player = null
        isPlaying = false
        isPreparing = false
        activeSource = null
    }

    internal fun release() {
        releasePlayer()
        scope.cancel()
    }
}

@Composable
fun rememberVoicePlayer(): VoicePlayerState {
    val context = LocalContext.current
    val state = remember { VoicePlayerState(context.applicationContext) }
    DisposableEffect(Unit) {
        onDispose { state.release() }
    }
    return state
}
