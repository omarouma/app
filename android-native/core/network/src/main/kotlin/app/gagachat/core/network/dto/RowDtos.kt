package app.gagachat.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * PostgREST row DTOs. These mirror the Supabase table columns (PDF §7.1) and are
 * mapped to domain models in the data layer.
 */

@Serializable
data class UserRow(
    val id: String,
    @SerialName("display_name") val displayName: String? = null,
    val username: String? = null,
    val avatar: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val bio: String? = null,
    val status: String? = null,
    @SerialName("last_seen") val lastSeen: Long? = null,
    @SerialName("created_at") val createdAt: Long? = null,
    @SerialName("is_verified") val isVerified: Boolean? = null,
    @SerialName("is_premium") val isPremium: Boolean? = null,
)

@Serializable
data class ConversationRow(
    val id: String,
    val type: String? = null,
    val title: String? = null,
    val avatar: String? = null,
    @SerialName("last_message_id") val lastMessageId: String? = null,
    @SerialName("last_message_preview") val lastMessagePreview: String? = null,
    @SerialName("last_message_at") val lastMessageAt: Long? = null,
    @SerialName("updated_at") val updatedAt: Long? = null,
    @SerialName("unread_count") val unreadCount: Int? = null,
    @SerialName("is_pinned") val isPinned: Boolean? = null,
    @SerialName("is_muted") val isMuted: Boolean? = null,
    @SerialName("is_archived") val isArchived: Boolean? = null,
)

@Serializable
data class ConversationMemberRow(
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("user_id") val userId: String,
    val role: String? = null,
    @SerialName("joined_at") val joinedAt: Long? = null,
    @SerialName("last_read_message_id") val lastReadMessageId: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    val avatar: String? = null,
)

@Serializable
data class MessageRow(
    val id: String,
    @SerialName("client_message_id") val clientMessageId: String? = null,
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("sender_id") val senderId: String,
    val type: String? = null,
    val text: String? = null,
    @SerialName("media_url") val mediaUrl: String? = null,
    @SerialName("thumbnail_url") val thumbnailUrl: String? = null,
    @SerialName("reply_to_message_id") val replyToMessageId: String? = null,
    @SerialName("created_at") val createdAt: Long? = null,
    @SerialName("edited_at") val editedAt: Long? = null,
    @SerialName("deleted_at") val deletedAt: Long? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
)

/** Insert payload for a new message. `client_message_id` is the idempotency key. */
@Serializable
data class MessageInsert(
    @SerialName("client_message_id") val clientMessageId: String,
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("sender_id") val senderId: String,
    val type: String,
    val text: String? = null,
    @SerialName("media_url") val mediaUrl: String? = null,
    @SerialName("thumbnail_url") val thumbnailUrl: String? = null,
    @SerialName("reply_to_message_id") val replyToMessageId: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
)

@Serializable
data class MessageReceiptRow(
    @SerialName("message_id") val messageId: String,
    @SerialName("user_id") val userId: String,
    @SerialName("delivered_at") val deliveredAt: Long? = null,
    @SerialName("read_at") val readAt: Long? = null,
)

@Serializable
data class CallSessionRow(
    val id: String,
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("initiator_id") val initiatorId: String,
    val type: String? = null,
    @SerialName("started_at") val startedAt: Long? = null,
    @SerialName("ended_at") val endedAt: Long? = null,
    val status: String? = null,
)

@Serializable
data class DeviceRow(
    @SerialName("user_id") val userId: String,
    @SerialName("device_id") val deviceId: String,
    @SerialName("push_token") val pushToken: String? = null,
    val platform: String = "android",
    @SerialName("last_active") val lastActive: Long? = null,
    @SerialName("app_version") val appVersion: String? = null,
)

@Serializable
data class BlockRow(
    @SerialName("owner_id") val ownerId: String,
    @SerialName("target_id") val targetId: String,
    val state: String? = null,
    @SerialName("created_at") val createdAt: Long? = null,
)
