package app.gagachat.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * PostgREST row DTOs. These mirror the LIVE Supabase table columns and are
 * mapped to domain models in the data layer.
 *
 * Live tables: users, chats, messages, chat_reads, call_history, device_tokens,
 * blocked_users. Timestamps arrive as ISO-8601 strings and are normalised to
 * epoch millis via [EpochMillisSerializer].
 */

@Serializable
data class UserRow(
    val id: String,
    @SerialName("name") val name: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    val username: String? = null,
    val avatar: String? = null,
    @SerialName("cover_image") val coverImage: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val bio: String? = null,
    val status: String? = null,
    @SerialName("status_message") val statusMessage: String? = null,
    val location: String? = null,
    val website: String? = null,
    @SerialName("is_verified") val isVerified: Boolean? = null,
    @SerialName("is_premium") val isPremium: Boolean? = null,
    val followers: Int? = null,
    val following: Int? = null,
    @SerialName("friend_count") val friendCount: Int? = null,
    @SerialName("last_seen") @Serializable(with = EpochMillisSerializer::class) val lastSeen: Long? = null,
    @SerialName("created_at") @Serializable(with = EpochMillisSerializer::class) val createdAt: Long? = null,
    @SerialName("updated_at") @Serializable(with = EpochMillisSerializer::class) val updatedAt: Long? = null,
)

@Serializable
data class ConversationRow(
    val id: String,
    val type: String? = null,
    @SerialName("name") val title: String? = null,
    val avatar: String? = null,
    val description: String? = null,
    val participants: List<String>? = null,
    val admins: List<String>? = null,
    @SerialName("created_by") val createdBy: String? = null,
    @SerialName("last_message") val lastMessagePreview: String? = null,
    @SerialName("last_message_sender_id") val lastMessageSenderId: String? = null,
    @SerialName("unread_count") val unreadCount: Int? = null,
    @SerialName("is_muted") val isMuted: Boolean? = null,
    @SerialName("pinned") val isPinned: Boolean? = null,
    @SerialName("archived") val isArchived: Boolean? = null,
    @SerialName("invite_code") val inviteCode: String? = null,
    @SerialName("updated_at") @Serializable(with = EpochMillisSerializer::class) val updatedAt: Long? = null,
    @SerialName("created_at") @Serializable(with = EpochMillisSerializer::class) val createdAt: Long? = null,
)

/** Insert payload for a new chat/conversation. */
@Serializable
data class ConversationInsert(
    val id: String,
    val type: String,
    val participants: List<String>,
    @SerialName("name") val title: String? = null,
    val avatar: String? = null,
    val description: String? = null,
    @SerialName("created_by") val createdBy: String? = null,
    val admins: List<String>? = null,
)

@Serializable
data class MessageRow(
    val id: String,
    @SerialName("local_id") val clientMessageId: String? = null,
    @SerialName("chat_id") val conversationId: String,
    @SerialName("sender_id") val senderId: String,
    val type: String? = null,
    @SerialName("content") val text: String? = null,
    @SerialName("media_url") val mediaUrl: String? = null,
    @SerialName("media_urls") val mediaUrls: List<String>? = null,
    @SerialName("reply_to") val replyToMessageId: String? = null,
    @SerialName("reactions") val reactions: Map<String, Int>? = null,
    @SerialName("forwarded_from") val forwardedFrom: String? = null,
    @SerialName("delivery_status") val deliveryStatus: String? = null,
    @SerialName("destroyed") val destroyed: Boolean? = null,
    @SerialName("metadata") val metadata: JsonObject? = null,
    @SerialName("created_at") @Serializable(with = EpochMillisSerializer::class) val createdAt: Long? = null,
    @SerialName("updated_at") @Serializable(with = EpochMillisSerializer::class) val updatedAt: Long? = null,
)

/**
 * Insert payload for a new message. `local_id` is the client idempotency key.
 * PostgREST cannot target the partial unique index on `local_id`, so idempotency
 * is enforced client-side (GET by local_id before POST).
 */
@Serializable
data class MessageInsert(
    @SerialName("local_id") val clientMessageId: String,
    @SerialName("chat_id") val conversationId: String,
    @SerialName("sender_id") val senderId: String,
    val type: String,
    @SerialName("content") val text: String? = null,
    @SerialName("media_url") val mediaUrl: String? = null,
    @SerialName("media_urls") val mediaUrls: List<String>? = null,
    @SerialName("reply_to") val replyToMessageId: String? = null,
    val metadata: JsonObject? = null,
)

/** Read cursor row (chat_reads). UNIQUE(chat_id, user_id) allows upsert. */
@Serializable
data class ChatReadRow(
    @SerialName("chat_id") val chatId: String,
    @SerialName("user_id") val userId: String,
    @SerialName("last_read_message_id") val lastReadMessageId: String? = null,
    @SerialName("last_read_at") @Serializable(with = EpochMillisSerializer::class) val lastReadAt: Long? = null,
)

/** Call history row (call_history). */
@Serializable
data class CallHistoryRow(
    val id: String,
    @SerialName("chat_id") val conversationId: String? = null,
    @SerialName("caller_id") val callerId: String,
    @SerialName("callee_id") val calleeId: String? = null,
    val type: String? = null,
    val status: String? = null,
    val duration: Long? = null,
    @SerialName("room_id") val roomId: String? = null,
    @SerialName("participant_ids") val participantIds: List<String>? = null,
    @SerialName("started_at") @Serializable(with = EpochMillisSerializer::class) val startedAt: Long? = null,
    @SerialName("ended_at") @Serializable(with = EpochMillisSerializer::class) val endedAt: Long? = null,
    @SerialName("created_at") @Serializable(with = EpochMillisSerializer::class) val createdAt: Long? = null,
)

/** Device token row (device_tokens). No unique constraint: dedupe client-side. */
@Serializable
data class DeviceRow(
    val id: String? = null,
    @SerialName("user_id") val userId: String,
    val token: String? = null,
    @SerialName("fcm_token") val fcmToken: String? = null,
    val platform: String = "android",
    @SerialName("device_name") val deviceName: String? = null,
    @SerialName("last_seen_at") @Serializable(with = EpochMillisSerializer::class) val lastSeenAt: Long? = null,
)

/** Block row (blocked_users). UNIQUE(blocker_id, blocked_id) allows upsert. */
@Serializable
data class BlockRow(
    val id: String? = null,
    @SerialName("blocker_id") val ownerId: String,
    @SerialName("blocked_id") val targetId: String,
    val reason: String? = null,
    @SerialName("created_at") @Serializable(with = EpochMillisSerializer::class) val createdAt: Long? = null,
)
