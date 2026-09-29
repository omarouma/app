package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Domain message — the exact model specified in PDF §5.3.
 *
 * `localId` is the Room primary key; `clientMessageId` is the idempotency key;
 * `serverMessageId` is the authoritative backend id once acknowledged.
 */
@Serializable
data class Message(
    val localId: String,
    @SerialName("client_message_id") val clientMessageId: String,
    @SerialName("server_message_id") val serverMessageId: String? = null,
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("sender_id") val senderId: String,
    val type: MessageType = MessageType.TEXT,
    val text: String? = null,
    @SerialName("media_url") val mediaUrl: String? = null,
    @SerialName("thumbnail_url") val thumbnailUrl: String? = null,
    @SerialName("reply_to_message_id") val replyToMessageId: String? = null,
    @SerialName("created_at_client") val createdAtClient: Long = 0L,
    @SerialName("created_at_server") val createdAtServer: Long? = null,
    val status: MessageStatus = MessageStatus.PENDING,
    @SerialName("edited_at") val editedAt: Long? = null,
    @SerialName("deleted_at") val deletedAt: Long? = null,
    // Denormalised sender info for fast rendering (PDF §5.4 — own/other avatars).
    @SerialName("sender_name") val senderName: String? = null,
    @SerialName("sender_avatar") val senderAvatar: String? = null,
    // Local-only upload progress 0..100 for media messages.
    @SerialName("upload_progress") val uploadProgress: Int? = null,
    @SerialName("local_media_path") val localMediaPath: String? = null,
    @SerialName("media_mime") val mediaMime: String? = null,
    @SerialName("media_size") val mediaSize: Long? = null,
    @SerialName("media_duration_ms") val mediaDurationMs: Long? = null,
    @SerialName("latitude") val latitude: Double? = null,
    @SerialName("longitude") val longitude: Double? = null,
    // Extra media URLs for multi-photo messages (first url lives in [mediaUrl]).
    @SerialName("media_urls") val mediaUrls: List<String> = emptyList(),
    // Reactions: emoji -> list of user ids who reacted (PDF §5.4 reactions).
    @SerialName("reactions") val reactions: Map<String, List<String>> = emptyMap(),
    // Original author id when this message was forwarded (PDF §5.4 forwarding).
    @SerialName("forwarded_from") val forwardedFrom: String? = null,
    // Contact-card payload (MessageType.CONTACT).
    @SerialName("contact_name") val contactName: String? = null,
    @SerialName("contact_phone") val contactPhone: String? = null,
) {
    /** Authoritative timestamp for ordering: server time when available, else client. */
    val sortTimestamp: Long get() = createdAtServer ?: createdAtClient

    val isPending: Boolean get() = status == MessageStatus.PENDING
    val isFailed: Boolean get() = status == MessageStatus.FAILED
    val isDeleted: Boolean get() = deletedAt != null
    val hasReactions: Boolean get() = reactions.isNotEmpty()

    /** True when this message carries more than one image. */
    val isMultiImage: Boolean
        get() = type == MessageType.IMAGE && allMediaUrls.size > 1

    /** Every media url for this message (deduplicated, order preserved). */
    val allMediaUrls: List<String>
        get() = (listOfNotNull(mediaUrl) + mediaUrls).distinct()

    /** Whether [userId] reacted with [emoji]. */
    fun hasReaction(emoji: String, userId: String): Boolean =
        reactions[emoji]?.contains(userId) == true

    /** Total number of individual reactions across all emojis. */
    val reactionCount: Int get() = reactions.values.sumOf { it.size }
}

@Serializable
enum class MessageType {
    @SerialName("text") TEXT,
    @SerialName("image") IMAGE,
    @SerialName("video") VIDEO,
    @SerialName("audio") AUDIO,
    @SerialName("file") FILE,
    @SerialName("location") LOCATION,
    @SerialName("contact") CONTACT,
    @SerialName("call_event") CALL_EVENT,
}

@Serializable
enum class MessageStatus {
    @SerialName("pending") PENDING,
    @SerialName("sent") SENT,
    @SerialName("delivered") DELIVERED,
    @SerialName("read") READ,
    @SerialName("failed") FAILED,
}

/**
 * Per-recipient delivery/read receipt (PDF §7.1 `message_receipts`).
 */
@Serializable
data class MessageReceipt(
    @SerialName("message_id") val messageId: String,
    @SerialName("user_id") val userId: String,
    @SerialName("delivered_at") val deliveredAt: Long? = null,
    @SerialName("read_at") val readAt: Long? = null,
)
