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
    /**
     * GaGa Circles: the purpose of this group. A circle is still an ordinary
     * secure group chat — the type only decides which structured tools are
     * surfaced around it (see [CircleType]). Defaults to [CircleType.GENERAL]
     * so groups created before circles existed keep working.
     */
    @SerialName("circle_type") val circleType: CircleType = CircleType.GENERAL,
    val members: List<GroupMember> = emptyList(),
) {
    val memberCount: Int get() = members.size
}

/**
 * The kind of GaGa Circle a group represents. Circles extend the existing group
 * model; they never fork the chat transport. The type is used purely to choose
 * which structured tool tray (tasks, events, safe check-in, assignments, …) is
 * shown around the same end-to-end group conversation.
 */
@Serializable
enum class CircleType {
    @SerialName("general") GENERAL,
    @SerialName("family") FAMILY,
    @SerialName("friends") FRIENDS,
    @SerialName("class") CLASS,
    @SerialName("work") WORK,
    @SerialName("business") BUSINESS;

    val label: String
        get() = when (this) {
            GENERAL -> "General"
            FAMILY -> "Family"
            FRIENDS -> "Friends"
            CLASS -> "Class"
            WORK -> "Work"
            BUSINESS -> "Business"
        }

    /** The structured tools surfaced for this circle type, in display order. */
    val tools: List<CircleTool>
        get() = when (this) {
            GENERAL -> listOf(CircleTool.TASKS, CircleTool.EVENTS, CircleTool.POLLS, CircleTool.SHARED_LIST)
            FAMILY -> listOf(CircleTool.SAFE_CHECK_IN, CircleTool.LIVE_LOCATION, CircleTool.SHARED_LIST, CircleTool.REMINDERS, CircleTool.SPLIT_BILL)
            FRIENDS -> listOf(CircleTool.POLLS, CircleTool.EVENTS, CircleTool.SPLIT_BILL, CircleTool.LIVE_LOCATION)
            CLASS -> listOf(CircleTool.ASSIGNMENTS, CircleTool.EVENTS, CircleTool.POLLS, CircleTool.NOTES, CircleTool.TRANSLATE)
            WORK -> listOf(CircleTool.TASKS, CircleTool.EVENTS, CircleTool.NOTES, CircleTool.TRANSLATE)
            BUSINESS -> listOf(CircleTool.TASKS, CircleTool.EVENTS, CircleTool.NOTES, CircleTool.TRANSLATE)
        }

    companion object {
        fun fromWire(value: String?): CircleType = when (value?.lowercase()) {
            "family" -> FAMILY
            "friends" -> FRIENDS
            "class" -> CLASS
            "work" -> WORK
            "business" -> BUSINESS
            else -> GENERAL
        }
    }
}

/** A structured tool a circle can surface around its group chat. */
@Serializable
enum class CircleTool {
    TASKS,
    ASSIGNMENTS,
    EVENTS,
    REMINDERS,
    POLLS,
    SHARED_LIST,
    SPLIT_BILL,
    LIVE_LOCATION,
    SAFE_CHECK_IN,
    NOTES,
    TRANSLATE;

    val label: String
        get() = when (this) {
            TASKS -> "Tasks"
            ASSIGNMENTS -> "Assignments"
            EVENTS -> "Events"
            REMINDERS -> "Reminders"
            POLLS -> "Polls"
            SHARED_LIST -> "Shared list"
            SPLIT_BILL -> "Split bill"
            LIVE_LOCATION -> "Live location"
            SAFE_CHECK_IN -> "Safe check-in"
            NOTES -> "Notes"
            TRANSLATE -> "Translate"
        }
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
