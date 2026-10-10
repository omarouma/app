package app.gagachat.feature.chat.presentation.components

import android.content.Context
import android.content.Intent
import android.webkit.MimeTypeMap
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import app.gagachat.core.model.Message
import app.gagachat.core.network.storage.MediaUrlResolver
import dagger.hilt.android.EntryPointAccessors
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Lifecycle of a "tap to open document" action (F12). */
sealed interface DocumentOpenState {
    data object Idle : DocumentOpenState
    data object Loading : DocumentOpenState
    data class Error(val message: String) : DocumentOpenState
}

/**
 * F12: opens a FILE message with the user's chosen viewer app.
 *
 * The old behaviour routed every non-text bubble (including documents) into the
 * full-screen *image* viewer, so tapping a PDF showed a broken photo. This
 * resolves the private-bucket media to a signed URL, downloads it into the
 * app cache, then launches `ACTION_VIEW` with the correct MIME type through a
 * [FileProvider] URI (no storage permission required).
 */
class DocumentOpener internal constructor(
    private val context: Context,
    private val resolver: MediaUrlResolver,
    private val scope: CoroutineScope,
) {
    var state by mutableStateOf<DocumentOpenState>(DocumentOpenState.Idle)
        private set

    fun open(message: Message) {
        scope.launch {
            state = DocumentOpenState.Loading
            try {
                val file = resolveDocumentFile(context, resolver, message)
                launchViewer(file, message)
                state = DocumentOpenState.Idle
            } catch (t: Throwable) {
                if (t is kotlinx.coroutines.CancellationException) throw t
                state = DocumentOpenState.Error(t.message ?: "Couldn't open the document")
            }
        }
    }

    fun dismiss() {
        state = DocumentOpenState.Idle
    }

    private fun launchViewer(file: File, message: Message) {
        val authority = "${context.packageName}.fileprovider"
        val uri = FileProvider.getUriForFile(context, authority, file)
        val mime = documentMime(message, file.name)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        if (intent.resolveActivity(context.packageManager) == null) {
            throw IllegalStateException("No app can open this file")
        }
        context.startActivity(intent)
    }
}

/**
 * Resolves a FILE message to a local, readable [File]: a locally captured/selected
 * copy when present, otherwise a signed-URL download cached under
 * `cache/documents`. Shared by [DocumentOpener] (view) and [DocumentSaver]
 * (save-to-device, V3.0 Sprint B) so both resolve the bytes identically.
 */
internal suspend fun resolveDocumentFile(
    context: Context,
    resolver: MediaUrlResolver,
    message: Message,
): File {
    // A locally captured/selected copy is already usable.
    val local = message.localMediaPath
    if (!local.isNullOrBlank()) {
        val f = File(local)
        if (f.exists() && f.length() > 0) return f
    }
    val remote = resolver.resolve(message.mediaUrl)
        ?: throw IllegalStateException("This document isn't available yet")
    val dir = File(context.cacheDir, "documents").apply { mkdirs() }
    val target = File(dir, documentSafeName(message.text))
    if (target.exists() && target.length() > 0) return target
    withContext(Dispatchers.IO) {
        val conn = (URL(remote).openConnection() as HttpURLConnection).apply {
            connectTimeout = 20_000
            readTimeout = 60_000
            instanceFollowRedirects = true
        }
        try {
            conn.inputStream.use { input -> target.outputStream().use { input.copyTo(it) } }
        } finally {
            conn.disconnect()
        }
    }
    return target
}

/** A filesystem-safe file name derived from a document message's text/label. */
internal fun documentSafeName(raw: String?): String {
    val base = raw
        ?.substringAfterLast('/')
        ?.substringAfterLast('\\')
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?: "attachment"
    return base.replace(Regex("[^A-Za-z0-9._-]"), "_")
}

/** The MIME type to hand to the viewer/saver, preferring the stored value. */
internal fun documentMime(message: Message, fileName: String): String =
    message.mediaMime?.takeIf { it.isNotBlank() } ?: guessMime(fileName)

private fun guessMime(name: String): String =
    MimeTypeMap.getSingleton()
        .getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase())
        ?: "*/*"

@Composable
fun rememberDocumentOpener(): DocumentOpener {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val resolver = remember(context) {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            MediaResolverEntryPoint::class.java,
        ).mediaUrlResolver()
    }
    return remember(context, resolver, scope) { DocumentOpener(context, resolver, scope) }
}
