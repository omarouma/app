package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Domain conversation (PDF §7.1 `conversations` + `conversation_members`).
 */
@Serializable
data class Conversation(
    val id: String,
    val type: ConversationType = ConversationType.DIRECT,
    val title: String? = null,
    val avatar: String? = null,
    @SerialName("last_message_id") val lastMessageId: String? = null,
    @SerialName("last_message_preview") val lastMessagePreview: String? = null,
    @SerialName("last_message_at") val lastMessageAt: Long? = null,
    @SerialName("updated_at") val updatedAt: Long = 0L,
    @SerialName("unread_count") val unreadCount: Int = 0,
    @SerialName("is_pinned") val isPinned: Boolean = false,
    @SerialName("is_muted") val isMuted: Boolean = false,
    @SerialName("is_archived") val isArchived: Boolean = false,
    val members: List<ConversationMember> = emptyList(),
) {
    /** For direct chats the display title is the other participant's name. */
    fun displayTitle(currentUserId: String): String {
        if (!title.isNullOrBlank()) return title
        val other = members.firstOrNull { it.userId != currentUserId }
        return other?.displayName?.takeIf { it.isNotBlank() } ?: "GaGa User"
    }

    fun otherMember(currentUserId: String): ConversationMember? =
        members.firstOrNull { it.userId != currentUserId }
}

@Serializable
enum class ConversationType {
    @SerialName("direct") DIRECT,
    @SerialName("group") GROUP,
    @SerialName("channel") CHANNEL,
}

@Serializable
data class ConversationMember(
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("user_id") val userId: String,
    val role: MemberRole = MemberRole.MEMBER,
    @SerialName("joined_at") val joinedAt: Long = 0L,
    @SerialName("last_read_message_id") val lastReadMessageId: String? = null,
    // Denormalised profile fields for fast list rendering without extra joins.
    @SerialName("display_name") val displayName: String? = null,
    val avatar: String? = null,
) {
    val isAdmin: Boolean get() = role == MemberRole.OWNER || role == MemberRole.ADMIN
}

@Serializable
enum class MemberRole {
    @SerialName("owner") OWNER,
    @SerialName("admin") ADMIN,
    @SerialName("member") MEMBER,
}
