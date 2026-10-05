package app.gagachat.feature.chat.presentation.components

import android.net.Uri
import android.widget.MediaController
import android.widget.Toast
import android.widget.VideoView
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageType
import coil.compose.SubcomposeAsyncImage
import kotlinx.coroutines.launch

/**
 * Full-screen media viewer for photo and video messages. Photos support
 * pinch-to-zoom and pan; videos play inline via a platform [VideoView] with the
 * standard media controller. Renders as a full-bleed dialog so it can be opened
 * from anywhere in the conversation without a navigation route.
 */
@Composable
fun MediaViewerOverlay(
    message: Message,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black),
        ) {
            when (message.type) {
                MessageType.VIDEO -> VideoPane(message = message)
                else -> ImagePane(message = message)
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .systemBarsPadding()
                    .padding(8.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                // Save to gallery (spec §8): offered for photos and videos so a
                // received attachment can be kept beyond the chat. The source is
                // the local cache when present, else the signed remote URL.
                if (message.type == MessageType.IMAGE || message.type == MessageType.VIDEO) {
                    IconButton(
                        onClick = {
                            scope.launch {
                                val toast = when (val result = MediaSaver.save(context, message)) {
                                    is MediaSaver.Result.Saved -> "Saved to gallery"
                                    MediaSaver.Result.NoSource -> "Nothing to save yet"
                                    MediaSaver.Result.Unsupported -> "This can't be saved"
                                    is MediaSaver.Result.Failed -> result.message
                                }
                                Toast.makeText(context, toast, Toast.LENGTH_SHORT).show()
                            }
                        },
                    ) {
                        Icon(
                            Icons.Filled.Download,
                            contentDescription = "Save to gallery",
                            tint = Color.White,
                        )
                    }
                }
                IconButton(onClick = onDismiss) {
                    Icon(
                        Icons.Filled.Close,
                        contentDescription = "Close",
                        tint = Color.White,
                    )
                }
            }
        }
    }
}

@Composable
private fun ImagePane(message: Message) {
    val signed = rememberSignedMediaUrl(message.mediaUrl)
    val model = rememberExistingLocalMedia(message.localMediaPath) ?: signed
    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }

    if (model.isNullOrBlank()) {
        ViewerMessage("Photo unavailable")
        return
    }

    SubcomposeAsyncImage(
        model = model,
        contentDescription = "Photo",
        contentScale = ContentScale.Fit,
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectTransformGestures { _, pan, zoom, _ ->
                    scale = (scale * zoom).coerceIn(1f, 5f)
                    if (scale > 1f) {
                        offsetX += pan.x
                        offsetY += pan.y
                    } else {
                        offsetX = 0f
                        offsetY = 0f
                    }
                }
            }
            .graphicsLayer(
                scaleX = scale,
                scaleY = scale,
                translationX = offsetX,
                translationY = offsetY,
            ),
        loading = { ViewerLoading() },
        error = { ViewerMessage("Couldn't load photo") },
    )
}

@Composable
private fun VideoPane(message: Message) {
    val signed = rememberSignedMediaUrl(message.mediaUrl)
    val source = rememberExistingLocalMedia(message.localMediaPath) ?: signed
    if (source.isNullOrBlank()) {
        ViewerMessage("Video unavailable")
        return
    }
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            VideoView(context).apply {
                setMediaController(MediaController(context).also { it.setAnchorView(this) })
                if (source.startsWith("content://") || source.startsWith("http")) {
                    setVideoURI(Uri.parse(source))
                } else {
                    setVideoPath(source)
                }
                setOnPreparedListener { it.isLooping = false }
                setOnErrorListener { _, _, _ -> true }
                setOnCompletionListener { start() }
                start()
            }
        },
    )
}

@Composable
private fun ViewerLoading() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Color.White)
    }
}

@Composable
private fun ViewerMessage(text: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(24.dp),
        ) {
            Icon(
                Icons.Filled.ErrorOutline,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(48.dp),
            )
            Text(
                text = text,
                color = Color.White,
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.padding(top = 12.dp),
            )
        }
    }
}
