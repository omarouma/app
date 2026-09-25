package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A confirmed friendship edge (LIVE table `friendships`). Stored symmetrically:
 * one row per direction, so both users see each other in their friends list.
 */
@Serializable
data class Friendship(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("friend_id") val friendId: String,
    @SerialName("created_at") val createdAt: Long = 0L,
)

/**
 * A pending/accepted/declined friend request (LIVE table `friend_requests`).
 */
@Serializable
data class FriendRequest(
    val id: String,
    @SerialName("from_user_id") val fromUserId: String,
    @SerialName("to_user_id") val toUserId: String,
    val status: FriendRequestStatus = FriendRequestStatus.PENDING,
    val message: String? = null,
    @SerialName("created_at") val createdAt: Long = 0L,
    @SerialName("updated_at") val updatedAt: Long = 0L,
    // Denormalised profile of the other party for list rendering.
    @SerialName("from_name") val fromName: String? = null,
    @SerialName("from_avatar") val fromAvatar: String? = null,
) {
    /** True when the current user is the recipient of the request. */
    fun isIncoming(currentUserId: String): Boolean = toUserId == currentUserId
}

@Serializable
enum class FriendRequestStatus {
    @SerialName("pending") PENDING,
    @SerialName("accepted") ACCEPTED,
    @SerialName("declined") DECLINED,
    @SerialName("cancelled") CANCELLED,
}

/** A friend plus their live profile, for the People list. */
@Serializable
data class Friend(
    val user: User,
    @SerialName("friends_since") val friendsSince: Long = 0L,
    @SerialName("is_online") val isOnline: Boolean = false,
)
