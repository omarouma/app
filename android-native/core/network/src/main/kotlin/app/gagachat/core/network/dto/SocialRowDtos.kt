package app.gagachat.core.network.dto

import app.gagachat.core.model.CoinActivity
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

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

/**
 * Result of the atomic friend-request lifecycle RPCs
 * (`gaga_accept_friend_request`, `gaga_decline_friend_request`,
 * `gaga_cancel_friend_request`). Each function returns a single jsonb object:
 * either a success payload carrying [status] (and, for accept, [friendId]) or a
 * rejection carrying [error]. A rejection is a normal HTTP 200 response, so it is
 * never confused with the transport-level "function not deployed" fallback.
 */
@Serializable
data class FriendRequestRpcResult(
    val status: String? = null,
    val error: String? = null,
    @SerialName("request_id") val requestId: String? = null,
    @SerialName("friend_id") val friendId: String? = null,
)

@Serializable
data class WalletRow(
    val id: String,
    @SerialName("user_id") val userId: String,
    val coins: Long? = null,
    /** Server-side ledger, persisted in the `transactions` jsonb column. */
    @SerialName("transactions")
    @Serializable(with = LenientCoinActivityListSerializer::class)
    val transactions: List<CoinActivity>? = null,
    @SerialName("created_at") @Serializable(with = EpochMillisSerializer::class) val createdAt: Long? = null,
    @SerialName("updated_at") @Serializable(with = EpochMillisSerializer::class) val updatedAt: Long? = null,
)

@Serializable
data class WalletInsert(
    @SerialName("user_id") val userId: String,
    val coins: Long = 0,
    val transactions: List<CoinActivity> = emptyList(),
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
    /** GaGa Circles: the purpose of the group (see [app.gagachat.core.model.CircleType]). */
    @SerialName("circle_type") val circleType: String? = null,
)

@Serializable
data class GroupInsert(
    val id: String,
    val name: String,
    val description: String? = null,
    val avatar: String? = null,
    @SerialName("created_by") val createdBy: String,
    @SerialName("circle_type") val circleType: String = "general",
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
    /**
     * `notifications.data` is a jsonb column that stores an OBJECT (e.g.
     * {"call_id":…,"room_id":…,"call_type":"voice"}). Typing it as `String?`
     * made every notification fetch fail with a JsonDecodingException, so the
     * notifications list was always empty. [JsonElement] accepts object/array/
     * scalar jsonb values; it is stringified when mapped to the domain model.
     */
    val data: JsonElement? = null,
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

/**
 * A bookmarked message (LIVE table `saved_messages`). Powers the Profile hub
 * "Saved Messages" surface.
 */
@Serializable
data class SavedMessageRow(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("message_id") val messageId: String,
    @SerialName("chat_id") val chatId: String,
    @SerialName("sender_id") val senderId: String? = null,
    val content: String? = null,
    val type: String? = null,
    @SerialName("media_url") val mediaUrl: String? = null,
    @SerialName("saved_at") @Serializable(with = EpochMillisSerializer::class) val savedAt: Long? = null,
)

/** Insert payload for bookmarking a message. */
@Serializable
data class SavedMessageInsert(
    @SerialName("user_id") val userId: String,
    @SerialName("message_id") val messageId: String,
    @SerialName("chat_id") val chatId: String,
    @SerialName("sender_id") val senderId: String? = null,
    val content: String? = null,
    val type: String = "text",
    @SerialName("media_url") val mediaUrl: String? = null,
)
