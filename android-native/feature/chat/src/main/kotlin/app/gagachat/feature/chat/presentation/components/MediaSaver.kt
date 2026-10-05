package app.gagachat.feature.chat.presentation.components

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Saves a received photo or video message to the device gallery (spec §8).
 *
 * The source is the local cached copy when present (instant and offline) and the
 * signed remote URL otherwise. Writing goes through [MediaStore] so the item lands
 * in the user's Pictures/Movies collection and is visible to the system gallery
 * immediately, without any broad storage permission on API 29+ (scoped storage).
 * On API 26-28 the caller must hold WRITE_EXTERNAL_STORAGE (declared with
 * maxSdkVersion="28" in the manifest).
 */
object MediaSaver {

    sealed interface Result {
        data class Saved(val displayName: String) : Result
        data object Unsupported : Result
        data object NoSource : Result
        data class Failed(val message: String) : Result
    }

    /** Saves [message] to the gallery. Safe to call from the UI via a coroutine. */
    suspend fun save(context: Context, message: Message): Result = withContext(Dispatchers.IO) {
        val isVideo = message.type == MessageType.VIDEO
        if (message.type != MessageType.IMAGE && !isVideo) {
            return@withContext Result.Unsupported
        }

        val source = message.localMediaPath?.takeIf { it.isNotBlank() }
            ?: message.mediaUrl?.takeIf { it.isNotBlank() }
            ?: return@withContext Result.NoSource

        val displayName = buildDisplayName(message, isVideo)
        val mime = message.mediaMime?.takeIf { it.isNotBlank() }
            ?: if (isVideo) "video/mp4" else "image/jpeg"

        runCatching { writeToGallery(context, source, displayName, mime, isVideo) }
            .fold(
                onSuccess = { Result.Saved(displayName) },
                onFailure = { Result.Failed(it.message ?: "Couldn't save the file.") },
            )
    }

    private fun buildDisplayName(message: Message, isVideo: Boolean): String {
        val ext = if (isVideo) "mp4" else "jpg"
        val base = message.clientMessageId
            .replace(Regex("[^A-Za-z0-9_-]"), "")
            .take(24)
            .ifBlank { System.currentTimeMillis().toString() }
        return "GaGa_$base.$ext"
    }

    private fun writeToGallery(
        context: Context,
        source: String,
        displayName: String,
        mime: String,
        isVideo: Boolean,
    ) {
        val collection = if (isVideo) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            } else {
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            }
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            } else {
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            }
        }

        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val relativeDir = if (isVideo) {
                    "${Environment.DIRECTORY_MOVIES}/GaGa"
                } else {
                    "${Environment.DIRECTORY_PICTURES}/GaGa"
                }
                put(MediaStore.MediaColumns.RELATIVE_PATH, relativeDir)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
        }

        val resolver = context.contentResolver
        val target = resolver.insert(collection, values)
            ?: throw IllegalStateException("Couldn't create a gallery entry.")

        try {
            resolver.openOutputStream(target)?.use { out ->
                openSource(context, source).use { input -> input.copyTo(out) }
            } ?: throw IllegalStateException("Couldn't open the destination file.")
        } catch (t: Throwable) {
            // Roll back the half-written row so the gallery never shows a broken tile.
            resolver.delete(target, null, null)
            throw t
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val done = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
            resolver.update(target, done, null, null)
        }
    }

    private fun openSource(context: Context, source: String): InputStream = when {
        source.startsWith("content://") ->
            context.contentResolver.openInputStream(Uri.parse(source))
                ?: throw IllegalStateException("Couldn't read the source file.")

        source.startsWith("http://") || source.startsWith("https://") -> {
            val connection = (URL(source).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 30_000
                instanceFollowRedirects = true
            }
            connection.inputStream
        }

        else -> File(source).inputStream()
    }
}
