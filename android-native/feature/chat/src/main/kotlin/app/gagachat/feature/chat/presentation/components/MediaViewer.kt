package app.gagachat.feature.chat.presentation.components

import android.net.Uri
import android.content.Intent
import android.content.ClipData
import androidx.core.content.FileProvider
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.material3.*
import androidx.compose.foundation.layout.Spacer
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import kotlinx.coroutines.launch
import app.gagachat.feature.chat.presentation.mediaActionMessage
import dagger.hilt.android.EntryPointAccessors
import android.widget.MediaController
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageType
import coil.compose.SubcomposeAsyncImage

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
    onForward: ((Message) -> Unit)? = null,
    onFavorite: ((Message) -> Unit)? = null,
    onEditCopy: ((Uri) -> Unit)? = null,
    onLocate: (() -> Unit)? = null,
    onAllMedia: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val saver = rememberDocumentSaver()
    val opener = rememberDocumentOpener()
    val resolver = remember(context) { EntryPointAccessors.fromApplication(context.applicationContext, MediaResolverEntryPoint::class.java).mediaUrlResolver() }
    var page by remember(message.localId) { androidx.compose.runtime.mutableIntStateOf(0) }
    val urls = message.allMediaUrls
    val url = urls.getOrNull(page) ?: message.mediaUrl
    val active = app.gagachat.feature.chat.presentation.selectedMediaMessage(message, url)
    val fileMessage = mediaActionMessage(message, url)
    var actions by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<Uri?>(null) }
    var extracting by remember { mutableStateOf<Uri?>(null) }
    fun withFile(action: (java.io.File) -> Unit) {
        if (busy) return
        busy = true
        scope.launch {
            try { action(resolveDocumentFile(context, resolver, fileMessage)) }
            catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
            catch (error: Exception) { failure = "Couldn't open this media. Check your connection and try again." }
            finally { busy = false }
        }
    }
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
                MessageType.VIDEO -> VideoPane(message = active)
                else -> androidx.compose.runtime.key(url) { ImagePane(message = active) }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .systemBarsPadding()
                    .padding(8.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                if (busy) CircularProgressIndicator(modifier = Modifier.size(32.dp), color = Color.White)
                IconButton(onClick = { actions = true }, enabled = !busy) {
                    Icon(Icons.Default.MoreVert, contentDescription = "Media actions", tint = Color.White)
                }
                IconButton(onClick = onDismiss) {
                    Icon(
                        Icons.Filled.Close,
                        contentDescription = "Close",
                        tint = Color.White,
                    )
                }
            }
            if (urls.size > 1) Row(Modifier.align(Alignment.BottomCenter).systemBarsPadding().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(enabled = page > 0, onClick = { page-- }) { Icon(Icons.Default.ChevronLeft, "Previous image", tint = Color.White) }
                Text("${page + 1}/${urls.size}", color = Color.White)
                IconButton(enabled = page < urls.lastIndex, onClick = { page++ }) { Icon(Icons.Default.ChevronRight, "Next image", tint = Color.White) }
            }
        }
    }
    if (actions) MediaActionsSheet(isImage = message.type == MessageType.IMAGE,
        onDismiss = { actions = false },
        onSave = { actions = false; saver.save(fileMessage) },
        onOpen = { actions = false; opener.open(fileMessage) },
        onShare = { actions = false; withFile { file ->
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = documentMime(fileMessage, file.name)
                putExtra(Intent.EXTRA_STREAM, uri)
                clipData = ClipData.newRawUri("GaGa media", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(Intent.createChooser(intent, "Share media"))
        } },
        onExtract = { actions = false; withFile { file -> extracting = Uri.fromFile(file) } },
        onForward = onForward?.let { callback -> { actions = false; callback(active) } },
        onFavorite = onFavorite?.let { callback -> { actions = false; callback(active) } },
        onEdit = onEditCopy?.let { { actions = false; withFile { file -> editing = Uri.fromFile(file) } } },
        onLocate = onLocate?.let { callback -> { actions = false; callback() } },
        onAllMedia = onAllMedia?.let { callback -> { actions = false; callback() } })
    editing?.let { uri -> PhotoEditorDialog(uri, onSave = { edited -> editing = null; onEditCopy?.invoke(edited) }, onDismiss = { editing = null }) }
    extracting?.let { uri -> ImageTextDialog(uri, onDismiss = { extracting = null }) }
    DocumentSaveOverlay(state = saver.state, onDismiss = saver::dismiss)
    DocumentOpenOverlay(state = opener.state, onDismiss = opener::dismiss)
    failure?.let { text -> AlertDialog(onDismissRequest = { failure = null }, text = { Text(text) }, confirmButton = { TextButton(onClick = { failure = null }) { Text("OK") } }) }
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
