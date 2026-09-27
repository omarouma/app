package app.gagachat.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Durable upload queue row (PDF §6). Survives process death so large uploads can
 * resume in the background via WorkManager.
 */
@Entity(
    tableName = "pending_uploads",
    indices = [Index(value = ["clientMessageId"]), Index(value = ["state"])],
)
data class PendingUploadEntity(
    @PrimaryKey val uploadId: String,
    val clientMessageId: String,
    val conversationId: String,
    val localPath: String,
    val mime: String,
    val size: Long,
    val type: String,
    val progress: Int,
    val attempts: Int,
    val remoteUrl: String?,
    val thumbnailUrl: String?,
    val state: String,
)
