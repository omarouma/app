package app.gagachat.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Local message row. Indexed on (conversationId, sortTimestamp) so the chat list
 * query is a single indexed range scan (PDF §9.1).
 *
 * `clientMessageId` is UNIQUE — this is the database-level guarantee that one user
 * action can never create two rows (PDF §5.2 duplicate prevention).
 *
 * `mediaUrls`, `reactions`, `forwardedFrom`, `contactName` and `contactPhone`
 * were added in schema v3 to support multi-photo messages, reactions, forwarding
 * and contact sharing.
 */
@Entity(
    tableName = "messages",
    indices = [
        Index(value = ["conversationId", "sortTimestamp"]),
        Index(value = ["clientMessageId"], unique = true),
        Index(value = ["serverMessageId"]),
        Index(value = ["status"]),
    ],
)
data class MessageEntity(
    @PrimaryKey val localId: String,
    val clientMessageId: String,
    val serverMessageId: String?,
    val conversationId: String,
    val senderId: String,
    val type: String,
    val text: String?,
    val mediaUrl: String?,
    val thumbnailUrl: String?,
    val replyToMessageId: String?,
    val createdAtClient: Long,
    val createdAtServer: Long?,
    val sortTimestamp: Long,
    val status: String,
    val editedAt: Long?,
    val deletedAt: Long?,
    val senderName: String?,
    val senderAvatar: String?,
    val uploadProgress: Int?,
    val localMediaPath: String?,
    val mediaMime: String?,
    val mediaSize: Long?,
    val mediaDurationMs: Long?,
    val latitude: Double?,
    val longitude: Double?,
    /** JSON array of extra media urls for multi-photo messages. */
    val mediaUrls: String? = null,
    /** JSON object: emoji -> [userIds]. */
    val reactions: String? = null,
    val forwardedFrom: String? = null,
    val contactName: String? = null,
    val contactPhone: String? = null,
    /**
     * "Delete for me" \u2014 hides this row from this device only without touching the
     * server copy (added in schema v5). Defaults to false so existing rows render.
     */
    val hiddenForMe: Boolean = false,
    /** Live-location expiry (epoch millis); null for a static pin. */
    val liveExpiresAt: Long? = null,
    /** Poll question (non-blank => poll message). */
    val pollQuestion: String? = null,
    /** JSON array of poll option labels. */
    val pollOptions: String? = null,
    /**
     * Scheduled send time (epoch millis). When non-null the row is held with
     * status `SCHEDULED` and delivered by [ScheduledMessageWorker] at this
     * instant. Added in schema v7.
     */
    val scheduledAt: Long? = null,
)
