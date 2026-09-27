package app.gagachat.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import app.gagachat.core.database.entity.ConversationEntity
import app.gagachat.core.database.entity.ConversationMemberEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ConversationDao {

    @Upsert
    suspend fun upsert(conversation: ConversationEntity)

    @Upsert
    suspend fun upsertAll(conversations: List<ConversationEntity>)

    @Query(
        """
        SELECT * FROM conversations
        WHERE isArchived = 0
        ORDER BY isPinned DESC, COALESCE(lastMessageAt, updatedAt) DESC
        """,
    )
    fun observeAll(): Flow<List<ConversationEntity>>

    @Query("SELECT * FROM conversations WHERE id = :id LIMIT 1")
    fun observeById(id: String): Flow<ConversationEntity?>

    @Query("SELECT * FROM conversations WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): ConversationEntity?

    @Query(
        """
        UPDATE conversations
        SET lastMessageId = :messageId,
            lastMessagePreview = :preview,
            lastMessageAt = :timestamp,
            updatedAt = :timestamp
        WHERE id = :conversationId
        """,
    )
    suspend fun updateLastMessage(
        conversationId: String,
        messageId: String,
        preview: String,
        timestamp: Long,
    )

    @Query("UPDATE conversations SET unreadCount = :count WHERE id = :conversationId")
    suspend fun updateUnreadCount(conversationId: String, count: Int)

    @Query("UPDATE conversations SET isPinned = :pinned WHERE id = :conversationId")
    suspend fun setPinned(conversationId: String, pinned: Boolean)

    @Query("UPDATE conversations SET isMuted = :muted WHERE id = :conversationId")
    suspend fun setMuted(conversationId: String, muted: Boolean)

    @Upsert
    suspend fun upsertMembers(members: List<ConversationMemberEntity>)

    @Query("SELECT * FROM conversation_members WHERE conversationId = :conversationId")
    fun observeMembers(conversationId: String): Flow<List<ConversationMemberEntity>>

    @Query("SELECT * FROM conversation_members WHERE conversationId = :conversationId")
    suspend fun getMembers(conversationId: String): List<ConversationMemberEntity>

    /** All members in one query (avoids the N+1 member lookup per conversation). */
    @Query("SELECT * FROM conversation_members")
    fun observeAllMembers(): Flow<List<ConversationMemberEntity>>

    @Query("SELECT * FROM conversation_members WHERE conversationId IN (:conversationIds)")
    suspend fun getMembersForConversations(conversationIds: List<String>): List<ConversationMemberEntity>

    /** Find an existing DIRECT conversation between two users (local cache). */
    @Query(
        """
        SELECT c.* FROM conversations c
        WHERE c.type = 'DIRECT'
          AND EXISTS (SELECT 1 FROM conversation_members m1
                      WHERE m1.conversationId = c.id AND m1.userId = :userA)
          AND EXISTS (SELECT 1 FROM conversation_members m2
                      WHERE m2.conversationId = c.id AND m2.userId = :userB)
        LIMIT 1
        """,
    )
    suspend fun findDirectConversation(userA: String, userB: String): ConversationEntity?

    @Query("DELETE FROM conversation_members WHERE conversationId = :conversationId")
    suspend fun deleteMembers(conversationId: String)

    @Query("DELETE FROM conversations WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM conversations")
    suspend fun deleteAll()
}
