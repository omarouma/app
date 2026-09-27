package app.gagachat.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import app.gagachat.core.database.entity.MessageEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface MessageDao {

    @Upsert
    suspend fun upsert(message: MessageEntity)

    @Upsert
    suspend fun upsertAll(messages: List<MessageEntity>)

    /** Latest page rendered immediately from cache when a chat opens (PDF §5.1). */
    @Query(
        """
        SELECT * FROM messages
        WHERE conversationId = :conversationId
        ORDER BY sortTimestamp DESC
        LIMIT :limit
        """,
    )
    fun observeLatest(conversationId: String, limit: Int): Flow<List<MessageEntity>>

    @Query(
        """
        SELECT * FROM messages
        WHERE conversationId = :conversationId
        ORDER BY sortTimestamp DESC
        LIMIT :limit
        """,
    )
    suspend fun getLatest(conversationId: String, limit: Int): List<MessageEntity>

    /** Cursor-based upward pagination (PDF §5.1). */
    @Query(
        """
        SELECT * FROM messages
        WHERE conversationId = :conversationId AND sortTimestamp < :beforeTimestamp
        ORDER BY sortTimestamp DESC
        LIMIT :limit
        """,
    )
    suspend fun getOlderThan(
        conversationId: String,
        beforeTimestamp: Long,
        limit: Int,
    ): List<MessageEntity>

    @Query("SELECT * FROM messages WHERE clientMessageId = :clientMessageId LIMIT 1")
    suspend fun getByClientMessageId(clientMessageId: String): MessageEntity?

    @Query("SELECT * FROM messages WHERE serverMessageId = :serverMessageId LIMIT 1")
    suspend fun getByServerMessageId(serverMessageId: String): MessageEntity?

    @Query("SELECT * FROM messages WHERE localId = :localId LIMIT 1")
    suspend fun getByLocalId(localId: String): MessageEntity?

    @Query("SELECT * FROM messages WHERE status = 'PENDING' ORDER BY createdAtClient ASC")
    suspend fun getPending(): List<MessageEntity>

    @Query("SELECT * FROM messages WHERE status = 'FAILED' ORDER BY createdAtClient ASC")
    suspend fun getFailed(): List<MessageEntity>

    @Query(
        """
        UPDATE messages
        SET status = :status,
            serverMessageId = COALESCE(:serverMessageId, serverMessageId),
            createdAtServer = COALESCE(:createdAtServer, createdAtServer),
            sortTimestamp = COALESCE(:createdAtServer, sortTimestamp)
        WHERE localId = :localId
        """,
    )
    suspend fun updateStatus(
        localId: String,
        status: String,
        serverMessageId: String?,
        createdAtServer: Long?,
    )

    @Query("UPDATE messages SET uploadProgress = :progress WHERE localId = :localId")
    suspend fun updateUploadProgress(localId: String, progress: Int)

    @Query(
        """
        UPDATE messages
        SET mediaUrl = :url, thumbnailUrl = :thumbnail, uploadProgress = 100
        WHERE localId = :localId
        """,
    )
    suspend fun updateMedia(localId: String, url: String, thumbnail: String?)

    @Query("UPDATE messages SET text = :text, editedAt = :editedAt WHERE localId = :localId")
    suspend fun updateText(localId: String, text: String, editedAt: Long)

    @Query("UPDATE messages SET deletedAt = :deletedAt, text = NULL WHERE localId = :localId")
    suspend fun markDeleted(localId: String, deletedAt: Long)

    @Query("SELECT COUNT(*) FROM messages WHERE conversationId = :conversationId")
    suspend fun countInConversation(conversationId: String): Int

    @Query("DELETE FROM messages WHERE conversationId = :conversationId")
    suspend fun deleteByConversation(conversationId: String)

    @Query("DELETE FROM messages")
    suspend fun deleteAll()
}
