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
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

fun UserRow.toDomain(): User = User(
    id = id,
    displayName = displayName ?: name ?: username ?: "User",
    username = username,
    avatar = avatar,
    phone = phone,
    email = email,
    bio = bio,
    status = status?.let { runCatching { UserStatus.valueOf(it.uppercase()) }.getOrNull() }
        ?: UserStatus.OFFLINE,
    lastSeen = lastSeen,
    createdAt = createdAt ?: 0L,
    isVerified = isVerified ?: false,
    isPremium = isPremium ?: false,
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
    val type = type?.let { runCatching { MessageType.valueOf(it.uppercase()) }.getOrNull() }
        ?: MessageType.TEXT
    val resolvedMedia = mediaUrl ?: mediaUrls?.firstOrNull()
    val thumbnail = mediaUrls?.getOrNull(1)
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
        thumbnailUrl = thumbnail,
        replyToMessageId = replyToMessageId,
        createdAtClient = createdAt ?: 0L,
        createdAtServer = createdAt,
        status = deliveryStatus?.let {
            runCatching { MessageStatus.valueOf(it.uppercase()) }.getOrNull()
        } ?: MessageStatus.SENT,
        editedAt = if (edited) updated else null,
        deletedAt = if (destroyed == true) updated else null,
        latitude = if (type == MessageType.LOCATION) meta?.double("lat") else null,
        longitude = if (type == MessageType.LOCATION) meta?.double("lng") else null,
    )
}

private fun JsonObject.double(key: String): Double? =
    this[key]?.jsonPrimitive?.content?.toDoubleOrNull()

fun CallHistoryRow.toDomain(
    peerId: String? = null,
    peerName: String? = null,
    peerAvatar: String? = null,
    isOutgoing: Boolean = false,
): CallSession {
    val start = startedAt
    val end = endedAt
    return CallSession(
        id = id,
        conversationId = conversationId ?: "",
        initiatorId = callerId,
        type = type?.let { runCatching { CallType.valueOf(it.uppercase()) }.getOrNull() }
            ?: CallType.AUDIO,
        startedAt = start ?: createdAt ?: 0L,
        endedAt = end,
        status = status?.let { runCatching { CallStatus.valueOf(it.uppercase()) }.getOrNull() }
            ?: CallStatus.ENDED,
        peerId = peerId,
        peerName = peerName,
        peerAvatar = peerAvatar,
        durationMs = duration ?: if (end != null && start != null) end - start else null,
        isOutgoing = isOutgoing,
    )
}
