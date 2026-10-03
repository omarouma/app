package app.gagachat.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import androidx.room.Transaction
import app.gagachat.core.database.entity.PendingUploadEntity
import app.gagachat.core.database.entity.MessageEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface UploadDao {

    @Upsert
    suspend fun upsert(upload: PendingUploadEntity)

    @Upsert
    suspend fun upsertAll(uploads: List<PendingUploadEntity>)

    @Upsert
    suspend fun upsertMessage(message: MessageEntity)

    /** A worker must never see a partially enqueued album. */
    @Transaction
    suspend fun enqueue(message: MessageEntity, uploads: List<PendingUploadEntity>) {
        upsertMessage(message)
        upsertAll(uploads)
    }

    @Query("SELECT * FROM pending_uploads WHERE clientMessageId = :clientMessageId ORDER BY rowid ASC")
    suspend fun getForMessage(clientMessageId: String): List<PendingUploadEntity>

    @Query("UPDATE pending_uploads SET state = CASE WHEN remoteUrl IS NULL THEN 'QUEUED' ELSE 'UPLOADED' END, attempts = 0 WHERE clientMessageId = :clientMessageId")
    suspend fun resetForRetry(clientMessageId: String)

    @Query("SELECT * FROM pending_uploads WHERE state IN ('QUEUED', 'UPLOADING', 'UPLOADED') ORDER BY rowid ASC")
    suspend fun getQueued(): List<PendingUploadEntity>

    @Query("SELECT * FROM pending_uploads WHERE clientMessageId = :clientMessageId LIMIT 1")
    fun observeByClientMessageId(clientMessageId: String): Flow<PendingUploadEntity?>

    @Query("UPDATE pending_uploads SET progress = :progress WHERE uploadId = :uploadId")
    suspend fun updateProgress(uploadId: String, progress: Int)

    @Query(
        """
        UPDATE pending_uploads
        SET state = :state, attempts = :attempts,
            remoteUrl = COALESCE(:remoteUrl, remoteUrl),
            thumbnailUrl = COALESCE(:thumbnailUrl, thumbnailUrl)
        WHERE uploadId = :uploadId
        """,
    )
    suspend fun updateState(
        uploadId: String,
        state: String,
        attempts: Int,
        remoteUrl: String?,
        thumbnailUrl: String?,
    )

    @Query("DELETE FROM pending_uploads WHERE uploadId = :uploadId")
    suspend fun delete(uploadId: String)

    @Query("DELETE FROM pending_uploads")
    suspend fun deleteAll()
}
