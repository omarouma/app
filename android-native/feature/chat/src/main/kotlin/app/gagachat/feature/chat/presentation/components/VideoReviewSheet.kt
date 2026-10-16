package app.gagachat.feature.chat.presentation.components

import android.net.Uri
import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Review an exported copy before sending; the picked source is never changed. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoReviewSheet(uri: Uri, onDismiss: () -> Unit, onSend: (Uri, String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var caption by remember(uri) { mutableStateOf("") }
    var busy by remember(uri) { mutableStateOf(false) }
    var sent by remember(uri) { mutableStateOf(false) }
    var error by remember(uri) { mutableStateOf<String?>(null) }
    var info by remember(uri) { mutableStateOf<VideoSourceInfo?>(null) }
    var history by remember(uri) { mutableStateOf(VideoEditHistory(VideoEdits(endMs = 0))) }
    var textDraft by remember(uri) { mutableStateOf("") }
    var exported by remember(uri) { mutableStateOf<File?>(null) }
    var exportJob by remember(uri) { mutableStateOf<Job?>(null) }
    val ownedFiles = remember(uri) { mutableListOf<File>() }
    val handedOff = remember(uri) { mutableSetOf<File>() }
    val videoView = remember(uri) {
        VideoView(context).apply {
            setMediaController(MediaController(context).also { it.setAnchorView(this) })
        }
    }
    LaunchedEffect(uri) {
        try {
            val metadata = withContext(Dispatchers.IO) { readVideoInfo(context, uri) }
            info = metadata
            history = VideoEditHistory(VideoEdits(endMs = metadata.durationMs))
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { error = "This video could not be opened. Please choose another video." }
    }
    fun invalidateExport() {
        exported?.let {
            videoView.stopPlayback()
            it.delete()
            ownedFiles.remove(it)
        }
        exported = null
        error = null
    }
    fun change(next: VideoEdits) {
        if (history.current != next) {
            invalidateExport()
            history = history.change(next)
        }
    }
    val edits = history.current
    LaunchedEffect(edits.text) { textDraft = edits.text }
    val previewUri = exported?.let(Uri::fromFile) ?: uri
    LaunchedEffect(previewUri) {
        videoView.stopPlayback()
        videoView.setOnPreparedListener { videoView.seekTo(1) }
        videoView.setOnErrorListener { _, _, _ ->
            error = "Preview could not play this video. Try exporting again or choose another video."
            true
        }
        videoView.setVideoURI(previewUri)
    }
    DisposableEffect(videoView) {
        onDispose {
            videoView.stopPlayback()
            ownedFiles.filterNot { it in handedOff }.forEach { it.delete() }
        }
    }
    val duration = info?.durationMs ?: 0L
    val original = edits.isOriginal(duration)
    var range by remember(edits.startMs, edits.endMs) {
        mutableStateOf(edits.startMs / 1000f..edits.endMs / 1000f)
    }
    val pendingText = textDraft != edits.text
    val pendingTrim = kotlin.math.abs(range.start * 1000 - edits.startMs) > 1f ||
        kotlin.math.abs(range.endInclusive * 1000 - edits.endMs) > 1f
    val editable = !busy && !sent && info != null
    ModalBottomSheet(
        onDismissRequest = { if (!busy && !sent) onDismiss() },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp)
            .verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Edit video", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(if (exported != null) "Edited preview · ready to review" else "Original preview · export to see your edits",
                style = MaterialTheme.typography.bodySmall)
            AndroidView(factory = { videoView }, modifier = Modifier.fillMaxWidth().height(210.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = {
                    invalidateExport(); history = history.undo()
                }, enabled = editable && history.past.isNotEmpty()) { Text("Undo") }
                TextButton(onClick = {
                    invalidateExport(); history = history.redo()
                }, enabled = editable && history.future.isNotEmpty()) { Text("Redo") }
                TextButton(onClick = {
                    change(VideoEdits(endMs = duration)); textDraft = ""
                }, enabled = editable && (!original || pendingText)) { Text("Restore original") }
            }
            if (duration > 1000) {
                Text("Trim clip", style = MaterialTheme.typography.titleSmall)
                RangeSlider(value = range, onValueChange = {
                    if (it.endInclusive - it.start >= 1f) {
                        if (exported != null) invalidateExport()
                        range = it
                    }
                }, onValueChangeFinished = {
                    change(edits.copy(startMs = (range.start * 1000).toLong(),
                        endMs = (range.endInclusive * 1000).toLong().coerceAtMost(duration)))
                }, valueRange = 0f..(duration / 1000f), enabled = editable)
                Text("${range.start.toInt()}s – ${range.endInclusive.toInt()}s",
                    style = MaterialTheme.typography.bodySmall)
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Mute video")
                Switch(checked = edits.muted, onCheckedChange = { change(edits.copy(muted = it)) }, enabled = editable)
            }
            OutlinedTextField(value = textDraft, onValueChange = { textDraft = it.take(80) },
                label = { Text("Text on video") }, modifier = Modifier.fillMaxWidth(), maxLines = 4, enabled = editable)
            TextButton(onClick = { change(edits.copy(text = textDraft)) }, enabled = editable && pendingText) {
                Text("Apply text")
            }
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                VideoOverlayPosition.entries.forEach { position ->
                    FilterChip(selected = edits.textPosition == position,
                        onClick = { change(edits.copy(textPosition = position)) },
                        label = { Text(position.label) }, enabled = editable)
                }
            }
            Text("Sticker", style = MaterialTheme.typography.titleSmall)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("", "❤️", "⭐", "🎉", "😊", "👍").forEach { sticker ->
                    FilterChip(selected = edits.sticker == sticker,
                        onClick = { change(edits.copy(sticker = sticker)) },
                        label = { Text(sticker.ifEmpty { "None" }) }, enabled = editable)
                }
            }
            OutlinedTextField(value = caption, onValueChange = { caption = it.take(1000) },
                label = { Text("Add a caption") }, modifier = Modifier.fillMaxWidth(), maxLines = 3, enabled = !busy && !sent)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (pendingText) Text("Apply your text before exporting.", style = MaterialTheme.typography.bodySmall)
            if (busy) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(12.dp))
                    Text("Preparing edited preview…")
                    TextButton(onClick = { exportJob?.cancel() }) { Text("Stop") }
                }
            }
            if (!original && exported == null) {
                Button(onClick = {
                    busy = true
                    error = null
                    videoView.pause()
                    exportJob = scope.launch {
                        try {
                            val file = exportVideo(context, uri, edits)
                            ownedFiles += file
                            exported = file
                        } catch (cancelled: CancellationException) { throw cancelled }
                        catch (_: Exception) {
                            error = "Could not export these edits. Try again, or restore the original video."
                        } finally { busy = false }
                    }
                }, enabled = editable && !pendingText && !pendingTrim && edits.isValid(duration), modifier = Modifier.fillMaxWidth()) {
                    Text("Export & preview")
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onDismiss, enabled = !busy && !sent) { Text("Cancel") }
                Button(onClick = {
                    // Latch immediately: fast repeated taps cannot enqueue two uploads.
                    if (!sent && !busy) {
                        sent = true
                        videoView.stopPlayback()
                        exported?.let { handedOff += it }
                        onSend(exported?.let(Uri::fromFile) ?: uri, caption)
                    }
                }, enabled = editable && !pendingText && !pendingTrim && (original || exported != null)) {
                    Text(if (original) "Send video" else "Send edited video")
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}
