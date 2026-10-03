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
            AND hiddenForMe = 0
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

    /** All messages still waiting to be delivered on a schedule, oldest first. */
    @Query("SELECT * FROM messages WHERE status = 'SCHEDULED' ORDER BY scheduledAt ASC")
    suspend fun getScheduled(): List<MessageEntity>

    /** Scheduled messages whose delivery time has arrived at [now] (epoch millis). */
    @Query(
        "SELECT * FROM messages WHERE status = 'SCHEDULED' AND scheduledAt IS NOT NULL " +
            "AND scheduledAt <= :now ORDER BY scheduledAt ASC",
    )
    suspend fun getDueScheduled(now: Long): List<MessageEntity>

    @Query("UPDATE messages SET scheduledAt = :scheduledAt WHERE localId = :localId")
    suspend fun updateScheduledAt(localId: String, scheduledAt: Long?)

    @Query("DELETE FROM messages WHERE localId = :localId AND status = 'SCHEDULED'")
    suspend fun deleteScheduled(localId: String)

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

    /**
     * F13: stores the full ordered set of media URLs for an album message. The
     * first URL is also mirrored into [mediaUrl] so single-image consumers keep
     * working, while [urls] (a JSON array) preserves the user's chosen order.
     */
    @Query(
        """
        UPDATE messages
        SET mediaUrl = :url, mediaUrls = :urls, uploadProgress = 100
        WHERE localId = :localId
        """,
    )
    suspend fun updateMediaAlbum(localId: String, url: String, urls: String?)

    @Query("UPDATE messages SET text = :text, editedAt = :editedAt WHERE localId = :localId")
    suspend fun updateText(localId: String, text: String, editedAt: Long)

    @Query("UPDATE messages SET reactions = :reactions WHERE localId = :localId")
    suspend fun updateReactions(localId: String, reactions: String?)

    @Query("UPDATE messages SET forwardedFrom = :forwardedFrom WHERE localId = :localId")
    suspend fun updateForwardedFrom(localId: String, forwardedFrom: String?)

    @Query("UPDATE messages SET deletedAt = :deletedAt, text = NULL WHERE localId = :localId")
    suspend fun markDeleted(localId: String, deletedAt: Long)

    /** "Delete for me" \u2014 hides the row locally without touching the server copy. */
    @Query("UPDATE messages SET hiddenForMe = 1 WHERE localId = :localId")
    suspend fun hideForMe(localId: String)

    /** Live-location: pushes fresh coordinates onto an existing live share. */
    @Query("UPDATE messages SET latitude = :latitude, longitude = :longitude WHERE localId = :localId")
    suspend fun updateLiveLocation(localId: String, latitude: Double, longitude: Double)

    /** Live-location: sets/clears the expiry (a past value ends the share). */
    @Query("UPDATE messages SET liveExpiresAt = :expiresAt WHERE localId = :localId")
    suspend fun updateLiveExpiry(localId: String, expiresAt: Long?)

    /** Restores a locally-hidden row (used when a chat is re-synced). */
    @Query("UPDATE messages SET hiddenForMe = 0 WHERE conversationId = :conversationId")
    suspend fun unhideAllInConversation(conversationId: String)

    @Query("SELECT COUNT(*) FROM messages WHERE conversationId = :conversationId AND hiddenForMe = 0")
    suspend fun countInConversation(conversationId: String): Int

    @Query("DELETE FROM messages WHERE conversationId = :conversationId")
    suspend fun deleteByConversation(conversationId: String)

    @Query("DELETE FROM messages")
    suspend fun deleteAll()
}
