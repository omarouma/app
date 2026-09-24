package app.gagachat.core.network.storage

import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.plugins.onUpload
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Supabase Storage uploads (PDF §6). Uploads are retry-safe: the caller supplies a
 * stable object path derived from the upload id, and `x-upsert` makes retries
 * idempotent.
 */
@Singleton
class SupabaseStorageApi @Inject constructor(
    private val client: HttpClient,
    private val config: SupabaseConfig,
    private val sessionStore: SessionStore,
) {

    suspend fun upload(
        objectPath: String,
        bytes: ByteArray,
        mime: String,
        onProgress: (Int) -> Unit = {},
    ): String {
        client.post("${config.storageUrl}/object/${config.storageBucket}/$objectPath") {
            header("apikey", config.anonKey)
            sessionStore.accessToken()?.let { header("Authorization", "Bearer $it") }
            header("x-upsert", "true")
            contentType(ContentType.parse(mime))
            setBody(bytes)
            onUpload { sent, total ->
                if (total != null && total > 0) {
                    onProgress(((sent * 100) / total).toInt().coerceIn(0, 100))
                }
            }
        }
        return publicUrl(objectPath)
    }

    fun publicUrl(objectPath: String): String =
        "${config.storageUrl}/object/public/${config.storageBucket}/$objectPath"

    /** Deterministic object path so retries overwrite rather than duplicate. */
    fun objectPath(userId: String, uploadId: String, extension: String): String =
        "$userId/$uploadId.$extension"
}
