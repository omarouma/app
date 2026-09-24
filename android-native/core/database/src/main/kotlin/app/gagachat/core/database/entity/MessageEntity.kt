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
)
