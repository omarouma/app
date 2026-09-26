package app.gagachat.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Row DTOs for the social / wallet / group / notification tables discovered on
 * the LIVE Supabase instance. Timestamps arrive as ISO-8601 strings and are
 * normalised to epoch millis via [EpochMillisSerializer].
 */

@Serializable
data class FriendshipRow(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("friend_id") val friendId: String,
    @SerialName("created_at") @Serializable(with = EpochMillisSerializer::class) val createdAt: Long? = null,
)

@Serializable
data class FriendRequestRow(
    val id: String,
    @SerialName("from_user_id") val fromUserId: String,
    @SerialName("to_user_id") val toUserId: String,
    val status: String? = null,
    val message: String? = null,
    @SerialName("created_at") @Serializable(with = EpochMillisSerializer::class) val createdAt: Long? = null,
    @SerialName("updated_at") @Serializable(with = EpochMillisSerializer::class) val updatedAt: Long? = null,
)

/** Insert payload for a friend request. */
@Serializable
data class FriendRequestInsert(
    @SerialName("from_user_id") val fromUserId: String,
    @SerialName("to_user_id") val toUserId: String,
    val status: String = "pending",
    val message: String? = null,
)

@Serializable
data class FriendshipInsert(
    @SerialName("user_id") val userId: String,
    @SerialName("friend_id") val friendId: String,
)

@Serializable
data class WalletRow(
    val id: String,
    @SerialName("user_id") val userId: String,
    val coins: Long? = null,
    @SerialName("created_at") @Serializable(with = EpochMillisSerializer::class) val createdAt: Long? = null,
    @SerialName("updated_at") @Serializable(with = EpochMillisSerializer::class) val updatedAt: Long? = null,
)

@Serializable
data class WalletInsert(
    @SerialName("user_id") val userId: String,
    val coins: Long = 0,
)

@Serializable
data class GroupRow(
    val id: String,
    val name: String,
    val description: String? = null,
    val avatar: String? = null,
    @SerialName("created_by") val createdBy: String? = null,
    @SerialName("created_at") @Serializable(with = EpochMillisSerializer::class) val createdAt: Long? = null,
    @SerialName("updated_at") @Serializable(with = EpochMillisSerializer::class) val updatedAt: Long? = null,
)

@Serializable
data class GroupInsert(
    val id: String,
    val name: String,
    val description: String? = null,
    val avatar: String? = null,
    @SerialName("created_by") val createdBy: String,
)

@Serializable
data class GroupMemberRow(
    val id: String,
    @SerialName("group_id") val groupId: String,
    @SerialName("user_id") val userId: String,
    val role: String? = null,
    @SerialName("joined_at") @Serializable(with = EpochMillisSerializer::class) val joinedAt: Long? = null,
)

@Serializable
data class GroupMemberInsert(
    @SerialName("group_id") val groupId: String,
    @SerialName("user_id") val userId: String,
    val role: String = "member",
)

@Serializable
data class NotificationRow(
    val id: String,
    @SerialName("user_id") val userId: String,
    val type: String? = null,
    val title: String? = null,
    val body: String? = null,
    val data: String? = null,
    val read: Boolean? = null,
    @SerialName("created_at") @Serializable(with = EpochMillisSerializer::class) val createdAt: Long? = null,
)

@Serializable
data class TypingRow(
    val id: String? = null,
    @SerialName("chat_id") val chatId: String,
    @SerialName("user_id") val userId: String,
    @SerialName("is_typing") val isTyping: Boolean = false,
    @SerialName("updated_at") @Serializable(with = EpochMillisSerializer::class) val updatedAt: Long? = null,
)
