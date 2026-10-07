package app.gagachat.core.data.mapper

import app.gagachat.core.model.CallSession
import app.gagachat.core.model.CallStatus
import app.gagachat.core.model.CallType
import app.gagachat.core.model.Conversation
import app.gagachat.core.model.ConversationMember
import app.gagachat.core.model.ConversationType
import app.gagachat.core.model.MemberRole
import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageStatus
import app.gagachat.core.model.MessageType
import app.gagachat.core.model.User
import app.gagachat.core.model.UserStatus
import app.gagachat.core.network.dto.CallHistoryRow
import app.gagachat.core.network.dto.ConversationRow
import app.gagachat.core.network.dto.MessageRow
import app.gagachat.core.network.dto.UserRow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

fun UserRow.toDomain(): User = User(
    id = id,
    // Keep the *real* human name only. Never collapse to the username or the
    // literal "User" here — that destroys identity and is the root cause of the
    // "@user"/"User"/"Unknown" symptoms. The UI resolves a safe label via
    // User.displayLabel (displayName → @username → phone → email → "GaGa User").
    displayName = displayName?.trim()?.takeIf { it.isNotEmpty() }
        ?: name?.trim()?.takeIf { it.isNotEmpty() }
        ?: "",
    username = username?.trim()?.takeIf { it.isNotEmpty() },
    avatar = avatar,
    phone = phone,
    email = email,
    bio = bio,
    statusMessage = statusMessage?.trim()?.takeIf { it.isNotEmpty() },
    website = website?.trim()?.takeIf { it.isNotEmpty() },
    coverImage = coverImage?.trim()?.takeIf { it.isNotEmpty() },
    coverVideo = coverVideo?.trim()?.takeIf { it.isNotEmpty() },
    status = status?.let { runCatching { UserStatus.valueOf(it.uppercase()) }.getOrNull() }
        ?: UserStatus.OFFLINE,
    lastSeen = lastSeen,
    createdAt = createdAt ?: 0L,
    isVerified = isVerified ?: false,
    isPremium = isPremium ?: false,
    // The backend stores the social graph as text[] arrays; surface their sizes
    // so the profile stats row shows real counts.
    followersCount = followers?.size ?: 0,
    followingCount = following?.size ?: 0,
)

fun ConversationRow.toDomain(members: List<ConversationMember> = emptyList()): Conversation =
    Conversation(
        id = id,
        type = type?.let { runCatching { ConversationType.valueOf(it.uppercase()) }.getOrNull() }
            ?: ConversationType.DIRECT,
        title = title?.takeIf { it.isNotBlank() },
        avatar = avatar?.takeIf { it.isNotBlank() },
        lastMessageId = null,
        lastMessagePreview = lastMessagePreview,
        lastMessageAt = updatedAt,
        updatedAt = updatedAt ?: createdAt ?: 0L,
        unreadCount = unreadCount ?: 0,
        isPinned = isPinned ?: false,
        isMuted = isMuted ?: false,
        isArchived = isArchived ?: false,
        members = members,
    )

fun MessageRow.toDomain(): Message {
    val meta = metadata
    val type = when (type?.lowercase()) {
        "call", "call_event" -> MessageType.CALL_EVENT
        else -> type?.let { runCatching { MessageType.valueOf(it.uppercase()) }.getOrNull() }
            ?: MessageType.TEXT
    }
    val resolvedMedia = mediaUrl ?: mediaUrls?.firstOrNull()
    val thumbnail = meta?.string("thumbnail") ?: mediaUrls?.getOrNull(1)
    val created = createdAt
    val updated = updatedAt
    val edited = created != null && updated != null && updated > created
    return Message(
        localId = clientMessageId ?: id,
        clientMessageId = clientMessageId ?: id,
        serverMessageId = id,
        conversationId = conversationId,
        senderId = senderId,
        type = type,
        text = text,
        mediaUrl = resolvedMedia,
        mediaUrls = mediaUrls ?: resolvedMedia?.let { listOf(it) } ?: emptyList(),
        thumbnailUrl = thumbnail,
        replyToMessageId = replyToMessageId,
        reactions = reactions?.toReactionMap() ?: emptyMap(),
        forwardedFrom = forwardedFrom,
        contactName = meta?.string("contact_name"),
        contactPhone = meta?.string("contact_phone"),
        createdAtClient = createdAt ?: 0L,
        createdAtServer = createdAt,
        status = deliveryStatus?.let {
            runCatching { MessageStatus.valueOf(it.uppercase()) }.getOrNull()
        } ?: MessageStatus.SENT,
        editedAt = if (edited) updated else null,
        deletedAt = if (destroyed == true) updated else null,
        latitude = if (type == MessageType.LOCATION) meta?.double("lat") else null,
        longitude = if (type == MessageType.LOCATION) meta?.double("lng") else null,
        mediaDurationMs = if (type == MessageType.AUDIO) meta?.long("duration_ms") else null,
        liveExpiresAt = meta?.long("live_expires_at"),
        pollQuestion = meta?.obj("poll")?.string("question"),
        pollOptions = meta?.obj("poll")?.stringList("options") ?: emptyList(),
    )
}

/**
 * Parses the backend `reactions` jsonb column (emoji -> [userIds]) into the
 * domain map. Tolerates a legacy `emoji -> count` shape by ignoring bare
 * numbers (which cannot be attributed to a user and therefore cannot be
 * toggled reliably).
 */
internal fun JsonObject.toReactionMap(): Map<String, List<String>> =
    entries.mapNotNull { (emoji, value) ->
        val users = (value as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull }
        if (users.isNullOrEmpty()) null else emoji to users
    }.toMap()

private fun JsonObject.double(key: String): Double? =
    this[key]?.jsonPrimitive?.content?.toDoubleOrNull()

private fun JsonObject.obj(key: String): JsonObject? = this[key] as? JsonObject

private fun JsonObject.stringList(key: String): List<String> =
    (this[key] as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull } ?: emptyList()

private fun JsonObject.long(key: String): Long? =
    this[key]?.jsonPrimitive?.content?.toLongOrNull()

private fun JsonObject.string(key: String): String? =
    (this[key] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotEmpty() }

fun CallHistoryRow.toDomain(
    conversationId: String? = null,
    peerId: String? = null,
    peerName: String? = null,
    peerAvatar: String? = null,
    isOutgoing: Boolean = false,
): CallSession {
    val start = startedAt
    val end = endedAt
    val mappedType = when (type?.lowercase()) {
        "video", "group_video" -> CallType.VIDEO
        else -> CallType.AUDIO
    }
    val mappedStatus = when (status?.lowercase()) {
        "idle", "calling", "ringing" -> CallStatus.RINGING
        "connecting", "reconnecting" -> CallStatus.CONNECTING
        "accepted", "connected" -> CallStatus.CONNECTED
        "declined" -> CallStatus.REJECTED
        "missed", "timeout" -> CallStatus.MISSED
        "busy" -> CallStatus.BUSY
        "failed" -> CallStatus.FAILED
        "ending", "ended", "cancelled" -> CallStatus.ENDED
        else -> CallStatus.ENDED
    }
    return CallSession(
        id = id,
        conversationId = this.conversationId ?: conversationId ?: "",
        initiatorId = callerId,
        type = mappedType,
        startedAt = start ?: createdAt ?: 0L,
        endedAt = end,
        status = mappedStatus,
        peerId = peerId,
        peerName = peerName,
        peerAvatar = peerAvatar,
        durationMs = duration?.times(1_000L) ?: if (end != null && start != null) end - start else null,
        isOutgoing = isOutgoing,
    )
}
