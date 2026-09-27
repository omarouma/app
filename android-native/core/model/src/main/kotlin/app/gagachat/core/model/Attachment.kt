package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Attachment metadata (PDF §7.1 `attachments`). The durable object key/URL is
 * produced by the storage upload step (PDF §6).
 */
@Serializable
data class Attachment(
    val id: String,
    @SerialName("message_id") val messageId: String,
    @SerialName("object_key") val objectKey: String? = null,
    val url: String? = null,
    val mime: String? = null,
    val size: Long? = null,
    val thumbnail: String? = null,
    @SerialName("duration_ms") val durationMs: Long? = null,
    val width: Int? = null,
    val height: Int? = null,
)

/**
 * A queued upload item. Retry-safe: the same [uploadId] is reused across retries
 * so the storage layer can deduplicate (PDF §6).
 */
@Serializable
data class PendingUpload(
    val uploadId: String,
    @SerialName("client_message_id") val clientMessageId: String,
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("local_path") val localPath: String,
    val mime: String,
    val size: Long,
    val type: MessageType,
    val progress: Int = 0,
    val attempts: Int = 0,
    @SerialName("remote_url") val remoteUrl: String? = null,
    @SerialName("thumbnail_url") val thumbnailUrl: String? = null,
    val state: UploadState = UploadState.QUEUED,
)

@Serializable
enum class UploadState {
    @SerialName("queued") QUEUED,
    @SerialName("uploading") UPLOADING,
    @SerialName("uploaded") UPLOADED,
    @SerialName("failed") FAILED,
}
