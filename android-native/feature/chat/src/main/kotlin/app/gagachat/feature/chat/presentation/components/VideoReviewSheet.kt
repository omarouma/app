package app.gagachat.feature.chat.presentation.components

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import java.io.File
import java.nio.ByteBuffer
import java.util.UUID
import kotlin.math.max
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Review and non-destructively trim a video before upload.
 * Trimming remuxes MP4 keyframes; it does not transcode and is approximate to
 * the preceding keyframe. Unsupported sources can still be sent unedited.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoReviewSheet(
    uri: Uri,
    onDismiss: () -> Unit,
    onSend: (Uri, String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var caption by remember(uri) { mutableStateOf("") }
    var muteOriginalAudio by remember(uri) { mutableStateOf(false) }
    var busy by remember(uri) { mutableStateOf(false) }
    var error by remember(uri) { mutableStateOf<String?>(null) }
    val durationMs by produceState(0L, uri) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                val retriever = MediaMetadataRetriever()
                try {
                    retriever.setDataSource(context, uri)
                    retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                        ?.toLongOrNull() ?: 0L
                } finally { retriever.release() }
            }.getOrDefault(0L)
        }
    }
    val totalSeconds = max(1f, durationMs / 1000f)
    var range by remember(uri, durationMs) { mutableStateOf(0f..totalSeconds) }
    val canTrim = durationMs > 1000L && (context.contentResolver.getType(uri)
        ?.contains("mp4", ignoreCase = true) == true || uri.toString().endsWith(".mp4", true))
    val edited = canTrim && (range.start > 0.5f || range.endInclusive < totalSeconds - 0.5f)
    val requiresExport = edited || (canTrim && muteOriginalAudio)
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val videoView = remember(uri) {
        VideoView(context).apply {
            setVideoURI(uri)
            setMediaController(MediaController(context).also { it.setAnchorView(this) })
        }
    }
    DisposableEffect(videoView) {
        onDispose { videoView.stopPlayback() }
    }

    ModalBottomSheet(
        onDismissRequest = { if (!busy) onDismiss() },
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Review video", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("Tap the preview to play or pause before sending.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            AndroidView(
                factory = { videoView },
                modifier = Modifier.fillMaxWidth().height(210.dp),
            )
            if (canTrim) {
                Text("Trim clip (MP4)", style = MaterialTheme.typography.titleSmall)
                RangeSlider(
                    value = range,
                    onValueChange = {
                        if (it.endInclusive - it.start >= 1f) range = it
                    },
                    valueRange = 0f..totalSeconds,
                    enabled = !busy,
                )
                Text("${range.start.toInt()}s – ${range.endInclusive.toInt()}s · " +
                    "Cuts snap to video keyframes.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = { range = 0f..totalSeconds }, enabled = !busy) {
                    Text("Reset trim")
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Mute original audio", style = MaterialTheme.typography.bodyMedium)
                        Text("Removes the video's audio track in the exported MP4.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = muteOriginalAudio,
                        onCheckedChange = { muteOriginalAudio = it },
                        enabled = !busy,
                    )
                }
            } else {
                Text("Trimming is available for MP4. Other video formats can be sent without edits.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedTextField(
                value = caption,
                onValueChange = { caption = it.take(1000) },
                label = { Text("Add a caption") },
                modifier = Modifier.fillMaxWidth(),
                maxLines = 3,
                enabled = !busy,
            )
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") }
                Spacer(Modifier.width(8.dp))
                Button(
                    onClick = {
                        if (!requiresExport) {
                            videoView.stopPlayback()
                            onSend(uri, caption)
                        } else {
                            busy = true
                            error = null
                            scope.launch {
                                videoView.stopPlayback()
                                val result = withContext(Dispatchers.IO) {
                                    runCatching {
                                        trimMp4(context, uri,
                                            (range.start * 1000).toLong(),
                                            (range.endInclusive * 1000).toLong(),
                                            muteAudio = muteOriginalAudio)
                                    }
                                }
                                busy = false
                                result.onSuccess { onSend(it, caption) }.onFailure {
                                    error = "Could not export this MP4. Reset trim and audio options to send the original."
                                }
                            }
                        }
                    },
                    enabled = !busy && (range.endInclusive - range.start >= 1f),
                ) {
                    if (busy) CircularProgressIndicator(Modifier.size(16.dp),
                        strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                    else Text(if (requiresExport) "Export & send" else "Send video")
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

/**
 * Android platform-only MP4 remux, no re-encoding.
 * The requested start is moved backward to the previous sync sample.
 * Abort cleanly on unsupported codecs or malformed tracks.
 */
internal fun muxTrackIncluded(mime: String, muteAudio: Boolean): Boolean =
    mime.startsWith("video/") || (!muteAudio && mime.startsWith("audio/"))

internal fun trimMp4(context: Context, source: Uri, startMs: Long, endMs: Long, muteAudio: Boolean = false): Uri {
    require(startMs >= 0 && endMs - startMs >= 1000L)
    val dir = File(context.cacheDir, "gaga_video_edits").apply { mkdirs() }
    val output = File(dir, "clip_${UUID.randomUUID()}.mp4")
    val extractor = MediaExtractor()
    var muxer: MediaMuxer? = null
    var started = false
    try {
        extractor.setDataSource(context, source, null)
        val map = mutableMapOf<Int, Int>()
        val mux = MediaMuxer(output.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        muxer = mux
        for (index in 0 until extractor.trackCount) {
            val format = extractor.getTrackFormat(index)
            val mime = format.getString(MediaFormat.KEY_MIME).orEmpty()
            if (muxTrackIncluded(mime, muteAudio)) {
                map[index] = mux.addTrack(format)
                extractor.selectTrack(index)
            }
        }
        require(map.isNotEmpty() &&
            (0 until extractor.trackCount).any {
                map.containsKey(it) && extractor.getTrackFormat(it)
                    .getString(MediaFormat.KEY_MIME).orEmpty().startsWith("video/")
            }
        ) { "No compatible video track" }
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(context, source)
            retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
                ?.toIntOrNull()?.let { mux.setOrientationHint(it) }
        } finally { retriever.release() }
        mux.start()
        started = true
        extractor.seekTo(startMs * 1000, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
        val buffer = ByteBuffer.allocateDirect(16 * 1024 * 1024)
        val info = MediaCodec.BufferInfo()
        var firstTimeUs = -1L
        var written = 0
        while (true) {
            val track = extractor.sampleTrackIndex
            if (track < 0) break
            val timeUs = extractor.sampleTime
            if (timeUs < 0 || timeUs >= endMs * 1000) break
            val size = extractor.readSampleData(buffer, 0)
            require(size >= 0) { "Invalid video sample" }
            if (firstTimeUs < 0) firstTimeUs = timeUs
            info.set(0, size, (timeUs - firstTimeUs).coerceAtLeast(0),
                extractor.sampleFlags)
            map[track]?.let { outputTrack ->
                buffer.position(0)
                buffer.limit(size)
                mux.writeSampleData(outputTrack, buffer, info)
                written++
            }
            extractor.advance()
        }
        require(written > 0) { "Empty trimmed clip" }
        mux.stop()
        started = false
        mux.release()
        muxer = null
        check(output.length() > 0L) { "Empty video" }
        return Uri.fromFile(output)
    } catch (error: Throwable) {
        output.delete()
        throw error
    } finally {
        extractor.release()
        if (started) runCatching { muxer?.stop() }
        runCatching { muxer?.release() }
    }
}
