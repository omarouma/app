package app.gagachat.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import app.gagachat.core.database.entity.PendingUploadEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface UploadDao {

    @Upsert
    suspend fun upsert(upload: PendingUploadEntity)

    // An album is one message: never dispatch a subset after a sibling fails.
    // Manual retry resets FAILED rows, making the complete album eligible again.
    @Query("""
        SELECT * FROM pending_uploads AS candidate
        WHERE state IN ('QUEUED', 'UPLOADING', 'UPLOADED')
        AND NOT EXISTS (
            SELECT 1 FROM pending_uploads AS sibling
            WHERE sibling.clientMessageId = candidate.clientMessageId
              AND sibling.state = 'FAILED'
        )
        ORDER BY candidate.rowid ASC
    """)
    suspend fun getQueued(): List<PendingUploadEntity>

    @Query("SELECT * FROM pending_uploads WHERE clientMessageId = :clientMessageId ORDER BY rowid ASC")
    suspend fun forMessage(clientMessageId: String): List<PendingUploadEntity>

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
