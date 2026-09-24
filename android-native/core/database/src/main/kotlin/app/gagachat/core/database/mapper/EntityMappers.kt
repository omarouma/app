package app.gagachat.core.database.mapper

import app.gagachat.core.database.entity.AttachmentEntity
import app.gagachat.core.database.entity.BlockEntity
import app.gagachat.core.database.entity.CallSessionEntity
import app.gagachat.core.database.entity.ConversationEntity
import app.gagachat.core.database.entity.ConversationMemberEntity
import app.gagachat.core.database.entity.MessageEntity
import app.gagachat.core.database.entity.PendingUploadEntity
import app.gagachat.core.database.entity.UserEntity
import app.gagachat.core.model.Attachment
import app.gagachat.core.model.BlockEntry
import app.gagachat.core.model.BlockState
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
import app.gagachat.core.model.PendingUpload
import app.gagachat.core.model.UploadState
import app.gagachat.core.model.User
import app.gagachat.core.model.UserStatus

// ---- User ----

fun UserEntity.toDomain(): User = User(
    id = id,
    displayName = displayName,
    username = username,
    avatar = avatar,
    phone = phone,
    email = email,
    bio = bio,
    status = runCatching { UserStatus.valueOf(status) }.getOrDefault(UserStatus.OFFLINE),
    lastSeen = lastSeen,
    createdAt = createdAt,
    isVerified = isVerified,
    isPremium = isPremium,
)

fun User.toEntity(cachedAt: Long): UserEntity = UserEntity(
    id = id,
    displayName = displayName,
    username = username,
    avatar = avatar,
    phone = phone,
    email = email,
    bio = bio,
    status = status.name,
    lastSeen = lastSeen,
    createdAt = createdAt,
    isVerified = isVerified,
    isPremium = isPremium,
    cachedAt = cachedAt,
)

// ---- Conversation ----

fun ConversationEntity.toDomain(members: List<ConversationMember> = emptyList()): Conversation = Conversation(
    id = id,
    type = runCatching { ConversationType.valueOf(type) }.getOrDefault(ConversationType.DIRECT),
    title = title,
    avatar = avatar,
    lastMessageId = lastMessageId,
    lastMessagePreview = lastMessagePreview,
    lastMessageAt = lastMessageAt,
    updatedAt = updatedAt,
    unreadCount = unreadCount,
    isPinned = isPinned,
    isMuted = isMuted,
    isArchived = isArchived,
    members = members,
)

fun Conversation.toEntity(cachedAt: Long): ConversationEntity = ConversationEntity(
    id = id,
    type = type.name,
    title = title,
    avatar = avatar,
    lastMessageId = lastMessageId,
    lastMessagePreview = lastMessagePreview,
    lastMessageAt = lastMessageAt,
    updatedAt = updatedAt,
    unreadCount = unreadCount,
    isPinned = isPinned,
    isMuted = isMuted,
    isArchived = isArchived,
    cachedAt = cachedAt,
)

fun ConversationMemberEntity.toDomain(): ConversationMember = ConversationMember(
    conversationId = conversationId,
    userId = userId,
    role = runCatching { MemberRole.valueOf(role) }.getOrDefault(MemberRole.MEMBER),
    joinedAt = joinedAt,
    lastReadMessageId = lastReadMessageId,
    displayName = displayName,
    avatar = avatar,
)

fun ConversationMember.toEntity(): ConversationMemberEntity = ConversationMemberEntity(
    conversationId = conversationId,
    userId = userId,
    role = role.name,
    joinedAt = joinedAt,
    lastReadMessageId = lastReadMessageId,
    displayName = displayName,
    avatar = avatar,
)

// ---- Message ----

fun MessageEntity.toDomain(): Message = Message(
    localId = localId,
    clientMessageId = clientMessageId,
    serverMessageId = serverMessageId,
    conversationId = conversationId,
    senderId = senderId,
    type = runCatching { MessageType.valueOf(type) }.getOrDefault(MessageType.TEXT),
    text = text,
    mediaUrl = mediaUrl,
    thumbnailUrl = thumbnailUrl,
    replyToMessageId = replyToMessageId,
    createdAtClient = createdAtClient,
    createdAtServer = createdAtServer,
    status = runCatching { MessageStatus.valueOf(status) }.getOrDefault(MessageStatus.PENDING),
    editedAt = editedAt,
    deletedAt = deletedAt,
    senderName = senderName,
    senderAvatar = senderAvatar,
    uploadProgress = uploadProgress,
    localMediaPath = localMediaPath,
    mediaMime = mediaMime,
    mediaSize = mediaSize,
    mediaDurationMs = mediaDurationMs,
    latitude = latitude,
    longitude = longitude,
)

fun Message.toEntity(): MessageEntity = MessageEntity(
    localId = localId,
    clientMessageId = clientMessageId,
    serverMessageId = serverMessageId,
    conversationId = conversationId,
    senderId = senderId,
    type = type.name,
    text = text,
    mediaUrl = mediaUrl,
    thumbnailUrl = thumbnailUrl,
    replyToMessageId = replyToMessageId,
    createdAtClient = createdAtClient,
    createdAtServer = createdAtServer,
    sortTimestamp = sortTimestamp,
    status = status.name,
    editedAt = editedAt,
    deletedAt = deletedAt,
    senderName = senderName,
    senderAvatar = senderAvatar,
    uploadProgress = uploadProgress,
    localMediaPath = localMediaPath,
    mediaMime = mediaMime,
    mediaSize = mediaSize,
    mediaDurationMs = mediaDurationMs,
    latitude = latitude,
    longitude = longitude,
)

// ---- Attachment ----

fun AttachmentEntity.toDomain(): Attachment = Attachment(
    id = id,
    messageId = messageId,
    objectKey = objectKey,
    url = url,
    mime = mime,
    size = size,
    thumbnail = thumbnail,
    durationMs = durationMs,
    width = width,
    height = height,
)

fun Attachment.toEntity(): AttachmentEntity = AttachmentEntity(
    id = id,
    messageId = messageId,
    objectKey = objectKey,
    url = url,
    mime = mime,
    size = size,
    thumbnail = thumbnail,
    durationMs = durationMs,
    width = width,
    height = height,
)

// ---- Call ----

fun CallSessionEntity.toDomain(): CallSession = CallSession(
    id = id,
    conversationId = conversationId,
    initiatorId = initiatorId,
    type = runCatching { CallType.valueOf(type) }.getOrDefault(CallType.AUDIO),
    startedAt = startedAt,
    endedAt = endedAt,
    status = runCatching { CallStatus.valueOf(status) }.getOrDefault(CallStatus.ENDED),
    peerId = peerId,
    peerName = peerName,
    peerAvatar = peerAvatar,
    durationMs = durationMs,
    isOutgoing = isOutgoing,
)

fun CallSession.toEntity(): CallSessionEntity = CallSessionEntity(
    id = id,
    conversationId = conversationId,
    initiatorId = initiatorId,
    type = type.name,
    startedAt = startedAt,
    endedAt = endedAt,
    status = status.name,
    peerId = peerId,
    peerName = peerName,
    peerAvatar = peerAvatar,
    durationMs = durationMs,
    isOutgoing = isOutgoing,
)

// ---- Upload ----

fun PendingUploadEntity.toDomain(): PendingUpload = PendingUpload(
    uploadId = uploadId,
    clientMessageId = clientMessageId,
    conversationId = conversationId,
    localPath = localPath,
    mime = mime,
    size = size,
    type = runCatching { MessageType.valueOf(type) }.getOrDefault(MessageType.FILE),
    progress = progress,
    attempts = attempts,
    remoteUrl = remoteUrl,
    thumbnailUrl = thumbnailUrl,
    state = runCatching { UploadState.valueOf(state) }.getOrDefault(UploadState.QUEUED),
)

fun PendingUpload.toEntity(): PendingUploadEntity = PendingUploadEntity(
    uploadId = uploadId,
    clientMessageId = clientMessageId,
    conversationId = conversationId,
    localPath = localPath,
    mime = mime,
    size = size,
    type = type.name,
    progress = progress,
    attempts = attempts,
    remoteUrl = remoteUrl,
    thumbnailUrl = thumbnailUrl,
    state = state.name,
)

// ---- Block ----

fun BlockEntity.toDomain(): BlockEntry = BlockEntry(
    ownerId = ownerId,
    targetId = targetId,
    state = runCatching { BlockState.valueOf(state) }.getOrDefault(BlockState.BLOCKED),
    createdAt = createdAt,
)

fun BlockEntry.toEntity(): BlockEntity = BlockEntity(
    ownerId = ownerId,
    targetId = targetId,
    state = state.name,
    createdAt = createdAt,
)
