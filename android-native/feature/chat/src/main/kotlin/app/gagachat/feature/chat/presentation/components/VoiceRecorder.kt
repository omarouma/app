package app.gagachat.feature.chat.presentation.components

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import java.io.File

/**
 * Minimal AAC/MPEG-4 voice recorder built on the platform [MediaRecorder].
 *
 * The recorder writes into the app cache dir so the resulting file can be handed
 * straight to [app.gagachat.core.data.repository.MediaRepository.enqueueUpload]
 * (which streams it to the `chat-media` bucket). One instance owns at most one
 * active recording; [start] is a no-op returning `false` if the mic is busy.
 */
class VoiceRecorder(private val context: Context) {

    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var startedAt = 0L

    val isRecording: Boolean get() = recorder != null

    /** Begins a new recording. Returns `false` if the microphone can't be opened. */
    fun start(): Boolean {
        if (recorder != null) return false
        val file = File(context.cacheDir, "voice_${System.currentTimeMillis()}.m4a")
        val mr = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }
        return try {
            mr.setAudioSource(MediaRecorder.AudioSource.MIC)
            mr.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            mr.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            mr.setAudioEncodingBitRate(64_000)
            mr.setAudioSamplingRate(44_100)
            mr.setOutputFile(file.absolutePath)
            mr.prepare()
            mr.start()
            recorder = mr
            outputFile = file
            startedAt = System.currentTimeMillis()
            true
        } catch (t: Throwable) {
            runCatching { mr.release() }
            recorder = null
            outputFile = null
            runCatching { file.delete() }
            false
        }
    }

    /**
     * Stops the active recording and returns `(path, durationMs, sizeBytes)` when
     * a usable clip was produced, or `null` when the clip was too short / empty.
     */
    fun stop(): Triple<String, Long, Long>? {
        val mr = recorder ?: return null
        val file = outputFile
        val duration = System.currentTimeMillis() - startedAt
        recorder = null
        outputFile = null
        return try {
            mr.stop()
            mr.release()
            if (file != null && file.exists() && file.length() > 0L) {
                Triple(file.absolutePath, duration, file.length())
            } else {
                runCatching { file?.delete() }
                null
            }
        } catch (t: Throwable) {
            // MediaRecorder throws if stopped before it captured a full frame.
            runCatching { mr.release() }
            runCatching { file?.delete() }
            null
        }
    }

    /** Aborts the active recording and deletes the partial file. */
    fun cancel() {
        val mr = recorder ?: return
        recorder = null
        runCatching { mr.stop() }
        runCatching { mr.release() }
        runCatching { outputFile?.delete() }
        outputFile = null
    }
}
