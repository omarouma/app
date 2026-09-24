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
import app.gagachat.core.network.dto.CallSessionRow
import app.gagachat.core.network.dto.ConversationMemberRow
import app.gagachat.core.network.dto.ConversationRow
import app.gagachat.core.network.dto.MessageRow
import app.gagachat.core.network.dto.UserRow

fun UserRow.toDomain(): User = User(
    id = id,
    displayName = displayName ?: username ?: "User",
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
        title = title,
        avatar = avatar,
        lastMessageId = lastMessageId,
        lastMessagePreview = lastMessagePreview,
        lastMessageAt = lastMessageAt,
        updatedAt = updatedAt ?: 0L,
        unreadCount = unreadCount ?: 0,
        isPinned = isPinned ?: false,
        isMuted = isMuted ?: false,
        isArchived = isArchived ?: false,
        members = members,
    )

fun ConversationMemberRow.toDomain(): ConversationMember = ConversationMember(
    conversationId = conversationId,
    userId = userId,
    role = role?.let { runCatching { MemberRole.valueOf(it.uppercase()) }.getOrNull() }
        ?: MemberRole.MEMBER,
    joinedAt = joinedAt ?: 0L,
    lastReadMessageId = lastReadMessageId,
    displayName = displayName,
    avatar = avatar,
)

fun MessageRow.toDomain(): Message = Message(
    localId = id,
    clientMessageId = clientMessageId ?: id,
    serverMessageId = id,
    conversationId = conversationId,
    senderId = senderId,
    type = type?.let { runCatching { MessageType.valueOf(it.uppercase()) }.getOrNull() }
        ?: MessageType.TEXT,
    text = text,
    mediaUrl = mediaUrl,
    thumbnailUrl = thumbnailUrl,
    replyToMessageId = replyToMessageId,
    createdAtClient = createdAt ?: 0L,
    createdAtServer = createdAt,
    status = MessageStatus.SENT,
    editedAt = editedAt,
    deletedAt = deletedAt,
    latitude = latitude,
    longitude = longitude,
)

fun CallSessionRow.toDomain(
    peerId: String? = null,
    peerName: String? = null,
    peerAvatar: String? = null,
    isOutgoing: Boolean = false,
): CallSession = CallSession(
    id = id,
    conversationId = conversationId,
    initiatorId = initiatorId,
    type = type?.let { runCatching { CallType.valueOf(it.uppercase()) }.getOrNull() }
        ?: CallType.AUDIO,
    startedAt = startedAt ?: 0L,
    endedAt = endedAt,
    status = status?.let { runCatching { CallStatus.valueOf(it.uppercase()) }.getOrNull() }
        ?: CallStatus.ENDED,
    peerId = peerId,
    peerName = peerName,
    peerAvatar = peerAvatar,
    durationMs = if (endedAt != null && startedAt != null) endedAt - startedAt else null,
    isOutgoing = isOutgoing,
)
