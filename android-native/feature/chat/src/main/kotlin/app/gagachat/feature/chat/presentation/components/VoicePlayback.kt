package app.gagachat.feature.chat.presentation.components

import android.media.AudioAttributes
import android.media.MediaPlayer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

/**
 * Tiny single-clip audio player for voice messages. Prefers the remote
 * [mediaUrl] and falls back to the locally recorded file while an upload is
 * still in flight. Only one clip plays at a time per instance; the underlying
 * [MediaPlayer] is always released when the composable leaves composition.
 */
class VoicePlayerState internal constructor() {
    private var player: MediaPlayer? = null

    var isPlaying by mutableStateOf(false)
        private set

    /** Toggles playback for [source]; returns `false` if the source can't play. */
    fun toggle(source: String?) {
        if (source.isNullOrBlank()) return
        if (isPlaying) {
            stop()
            return
        }
        val mp = MediaPlayer()
        return try {
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
                runCatching { it.start() }
                isPlaying = true
            }
            mp.setOnCompletionListener {
                it.release()
                if (player === it) player = null
                isPlaying = false
            }
            mp.setOnErrorListener { _, _, _ ->
                runCatching { mp.release() }
                if (player === mp) player = null
                isPlaying = false
                true
            }
            // Assign before prepareAsync so the OnPreparedListener can match it.
            player = mp
            mp.prepareAsync()
            isPlaying = false
        } catch (t: Throwable) {
            runCatching { mp.release() }
            if (player === mp) player = null
            isPlaying = false
        }
    }

    fun stop() {
        player?.let { runCatching { it.stop() }; runCatching { it.release() } }
        player = null
        isPlaying = false
    }

    internal fun release() = stop()
}

@Composable
fun rememberVoicePlayer(): VoicePlayerState {
    val state = remember { VoicePlayerState() }
    DisposableEffect(Unit) {
        onDispose { state.release() }
    }
    return state
}
