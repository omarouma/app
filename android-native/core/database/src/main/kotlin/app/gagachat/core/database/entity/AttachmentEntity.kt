package app.gagachat.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "attachments",
    indices = [Index(value = ["messageId"])],
)
data class AttachmentEntity(
    @PrimaryKey val id: String,
    val messageId: String,
    val objectKey: String?,
    val url: String?,
    val mime: String?,
    val size: Long?,
    val thumbnail: String?,
    val durationMs: Long?,
    val width: Int?,
    val height: Int?,
)
