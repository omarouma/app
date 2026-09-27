package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A group entity (LIVE table `groups`). Membership lives in `group_members`.
 * A group is surfaced in the chat list as a conversation of type GROUP.
 */
@Serializable
data class Group(
    val id: String,
    val name: String,
    val description: String? = null,
    val avatar: String? = null,
    @SerialName("created_by") val createdBy: String? = null,
    @SerialName("created_at") val createdAt: Long = 0L,
    @SerialName("updated_at") val updatedAt: Long = 0L,
    val members: List<GroupMember> = emptyList(),
) {
    val memberCount: Int get() = members.size
}

@Serializable
data class GroupMember(
    val id: String,
    @SerialName("group_id") val groupId: String,
    @SerialName("user_id") val userId: String,
    val role: GroupRole = GroupRole.MEMBER,
    @SerialName("joined_at") val joinedAt: Long = 0L,
    // Denormalised profile fields for rendering.
    @SerialName("display_name") val displayName: String? = null,
    val avatar: String? = null,
) {
    val isAdmin: Boolean get() = role == GroupRole.OWNER || role == GroupRole.ADMIN
}

@Serializable
enum class GroupRole {
    @SerialName("owner") OWNER,
    @SerialName("admin") ADMIN,
    @SerialName("member") MEMBER,
}
