package app.gagachat.feature.chat.presentation.components

import android.media.AudioAttributes
import android.media.MediaPlayer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
class VoicePlayerState internal constructor() {
    private var player: MediaPlayer? = null
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
                runCatching { it.start() }
                isPlaying = true
                startPolling()
            }
            mp.setOnCompletionListener {
                if (player === it) {
                    isPlaying = false
                    positionMs = durationMs
                    stopPolling()
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
        runCatching { mp.start() }
        isPlaying = true
        error = false
        startPolling()
    }

    private fun pause() {
        player?.let { runCatching { it.pause() } }
        isPlaying = false
        stopPolling()
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
        player?.let { runCatching { it.release() } }
        player = null
        isPlaying = false
        isPreparing = false
        error = true
    }

    fun stop() = releasePlayer()

    private fun releasePlayer() {
        stopPolling()
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
    val state = remember { VoicePlayerState() }
    DisposableEffect(Unit) {
        onDispose { state.release() }
    }
    return state
}
