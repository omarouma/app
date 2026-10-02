package app.gagachat.core.network.storage

import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.plugins.onUpload
import io.ktor.client.plugins.timeout
import io.ktor.client.request.forms.InputProvider
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.utils.io.streams.asInput
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Supabase Storage uploads (PDF §6). Uploads are retry-safe: the caller supplies a
 * stable object path derived from the upload id, and `x-upsert` makes retries
 * idempotent.
 *
 * Chat media uses the configured [SupabaseConfig.storageBucket]; avatars and other
 * assets can target an explicit bucket via [uploadToBucket].
 */
@Singleton
class SupabaseStorageApi @Inject constructor(
    private val client: HttpClient,
    private val config: SupabaseConfig,
    private val sessionStore: SessionStore,
) {

    private companion object {
        /**
         * F09: the shared client timeout is 30 s, but the app accepts attachments
         * up to 100 MiB. On a slow mobile link a large upload legitimately needs
         * minutes, so uploads override the per-request timeout. The socket timeout
         * stays generous enough to tolerate a stalled-but-progressing transfer
         * while still failing a truly dead connection.
         */
        const val UPLOAD_REQUEST_TIMEOUT_MS = 10 * 60 * 1000L // 10 minutes
        const val UPLOAD_SOCKET_TIMEOUT_MS = 60 * 1000L // 60 s idle
        const val UPLOAD_CONNECT_TIMEOUT_MS = 30 * 1000L
    }

    suspend fun upload(
        objectPath: String,
        bytes: ByteArray,
        mime: String,
        onProgress: (Int) -> Unit = {},
    ): String = uploadToBucket(
        bucket = config.storageBucket,
        objectPath = objectPath,
        bytes = bytes,
        mime = mime,
        onProgress = onProgress,
    )

    /** Uploads to an explicit bucket (e.g. `avatars`) and returns the public URL. */
    suspend fun uploadToBucket(
        bucket: String,
        objectPath: String,
        bytes: ByteArray,
        mime: String,
        onProgress: (Int) -> Unit = {},
    ): String {
        client.post("${config.storageUrl}/object/$bucket/$objectPath") {
            header("apikey", config.anonKey)
            sessionStore.accessToken()?.let { header("Authorization", "Bearer $it") }
            header("x-upsert", "true")
            contentType(ContentType.parse(mime))
            timeout {
                requestTimeoutMillis = UPLOAD_REQUEST_TIMEOUT_MS
                socketTimeoutMillis = UPLOAD_SOCKET_TIMEOUT_MS
                connectTimeoutMillis = UPLOAD_CONNECT_TIMEOUT_MS
            }
            setBody(bytes)
            onUpload { sent, total ->
                if (total != null && total > 0) {
                    onProgress(((sent * 100) / total).toInt().coerceIn(0, 100))
                }
            }
        }
        return publicUrlForBucket(bucket, objectPath)
    }

    fun publicUrl(objectPath: String): String =
        publicUrlForBucket(config.storageBucket, objectPath)

    /**
     * Streams a file straight from disk to Storage without buffering the whole
     * payload in memory (F08). The previous path called `File.readBytes()`, which
     * held the entire attachment (up to 100 MiB) in the heap and could OOM on
     * low-memory devices.
     */
    suspend fun uploadFile(
        objectPath: String,
        file: File,
        mime: String,
        onProgress: (Int) -> Unit = {},
    ): String = uploadFileToBucket(
        bucket = config.storageBucket,
        objectPath = objectPath,
        file = file,
        mime = mime,
        onProgress = onProgress,
    )

    /** Streaming variant of [uploadToBucket] for large attachments. */
    suspend fun uploadFileToBucket(
        bucket: String,
        objectPath: String,
        file: File,
        mime: String,
        onProgress: (Int) -> Unit = {},
    ): String {
        client.post("${config.storageUrl}/object/$bucket/$objectPath") {
            header("apikey", config.anonKey)
            sessionStore.accessToken()?.let { header("Authorization", "Bearer $it") }
            header("x-upsert", "true")
            contentType(ContentType.parse(mime))
            timeout {
                requestTimeoutMillis = UPLOAD_REQUEST_TIMEOUT_MS
                socketTimeoutMillis = UPLOAD_SOCKET_TIMEOUT_MS
                connectTimeoutMillis = UPLOAD_CONNECT_TIMEOUT_MS
            }
            setBody(InputProvider(file.length()) { file.inputStream().asInput() })
            onUpload { sent, total ->
                if (total != null && total > 0) {
                    onProgress(((sent * 100) / total).toInt().coerceIn(0, 100))
                }
            }
        }
        return publicUrlForBucket(bucket, objectPath)
    }

    fun publicUrlForBucket(bucket: String, objectPath: String): String =
        "${config.storageUrl}/object/public/$bucket/$objectPath"

    /** Deterministic object path so retries overwrite rather than duplicate. */
    fun objectPath(userId: String, uploadId: String, extension: String): String =
        "$userId/$uploadId.$extension"

    /**
     * Deterministic avatar path. Scoped to the caller's own top-level folder so it
     * satisfies the storage RLS policy (`split_part(name,'/',1) = auth.uid()`), and
     * overwrites on re-upload so a user never accumulates orphaned avatars.
     */
    fun avatarObjectPath(userId: String, extension: String): String =
        "$userId/avatar.$extension"
}
