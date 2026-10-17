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
    val sessions = EntryPointAccessors.fromApplication(context.applicationContext,
        MediaResolverEntryPoint::class.java).sessionStore()
    val owner = sessions.userId()?.takeIf { it.isNotBlank() }
        ?: throw IllegalStateException("Sign in to access this attachment")
    val key = app.gagachat.feature.chat.presentation.attachmentCacheKey(owner, message)
    val dir = File(context.cacheDir, "documents/$key").apply { mkdirs() }
    val target = File(dir, documentSafeName(message.text).take(120))
    val local = message.localMediaPath?.let { path ->
        if (path.startsWith("content://")) path else File(if (path.startsWith("file://")) android.net.Uri.parse(path).path.orEmpty() else path).takeIf { it.isFile && it.length() > 0 }?.path
    }
    // Re-authorize remote private storage even if bytes are already cached.
    val source = local ?: resolver.resolve(message.mediaUrl)
        ?: throw IllegalStateException("This attachment isn't available")
    if (owner != sessions.userId()) throw IllegalStateException("Account changed")
    withContext(Dispatchers.IO) {
        if (target.isFile && target.length() > 0) return@withContext
        val temp = File.createTempFile("attachment-", ".part", dir)
        try {
            val input = when {
                source.startsWith("content://") -> context.contentResolver.openInputStream(android.net.Uri.parse(source))
                    ?: throw IllegalStateException("Couldn't read the selected file")
                !source.startsWith("https://") -> {
                    require(!source.contains("://")) { "Only secure media links are supported" }
                    File(source).inputStream()
                }
                else -> {
                    val connection = (URL(source).openConnection() as HttpURLConnection).apply {
                        connectTimeout = 20_000; readTimeout = 60_000; instanceFollowRedirects = false
                    }
                    if (connection.responseCode !in 200..299) {
                        connection.disconnect()
                        throw IllegalStateException("Attachment download failed")
                    }
                    object : java.io.FilterInputStream(connection.inputStream) {
                        override fun close() { try { super.close() } finally { connection.disconnect() } }
                    }
                }
            }
            input.use { stream -> temp.outputStream().use { output ->
                val buffer = ByteArray(64 * 1024)
                var total = 0L
                while (true) {
                    val read = stream.read(buffer)
                    if (read < 0) break
                    total += read
                    check(total <= 100L * 1024 * 1024) { "Attachment exceeds the download limit" }
                    output.write(buffer, 0, read)
                }
                check(total > 0) { "Attachment is empty" }
            } }
            check(owner == sessions.userId()) { "Account changed" }
            check(temp.renameTo(target)) { "Couldn't stage attachment" }
        } finally { temp.delete() }
    }
    check(owner == sessions.userId()) { "Account changed" }
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
    return base.replace(Regex("[^A-Za-z0-9._-]"), "_").take(120).takeUnless { it == "." || it == ".." } ?: "attachment"
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
