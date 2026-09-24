package app.gagachat.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "conversations",
    indices = [
        Index(value = ["updatedAt"]),
        Index(value = ["lastMessageAt"]),
    ],
)
data class ConversationEntity(
    @PrimaryKey val id: String,
    val type: String,
    val title: String?,
    val avatar: String?,
    val lastMessageId: String?,
    val lastMessagePreview: String?,
    val lastMessageAt: Long?,
    val updatedAt: Long,
    val unreadCount: Int,
    val isPinned: Boolean,
    val isMuted: Boolean,
    val isArchived: Boolean,
    val cachedAt: Long,
)

@Entity(
    tableName = "conversation_members",
    primaryKeys = ["conversationId", "userId"],
    indices = [Index(value = ["conversationId"]), Index(value = ["userId"])],
)
data class ConversationMemberEntity(
    val conversationId: String,
    val userId: String,
    val role: String,
    val joinedAt: Long,
    val lastReadMessageId: String?,
    val displayName: String?,
    val avatar: String?,
)
