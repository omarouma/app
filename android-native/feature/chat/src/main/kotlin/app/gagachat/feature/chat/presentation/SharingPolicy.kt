package app.gagachat.feature.chat.presentation

import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageType
import app.gagachat.core.model.User
import java.security.MessageDigest
import java.util.Locale

/** Names are presentation only; identity and account determine cached bytes. */
internal fun attachmentCacheKey(owner: String, message: Message): String {
    require(owner.isNotBlank())
    val identity = listOf(owner, message.conversationId, message.serverMessageId ?: message.localId,
        message.mediaUrl.orEmpty(), message.localMediaPath.orEmpty()).joinToString("\u0000")
    return MessageDigest.getInstance("SHA-256").digest(identity.toByteArray())
        .joinToString("") { "%02x".format(it) }
}

internal fun mediaActionMessage(message: Message, url: String? = message.mediaUrl): Message {
    val extension = when (message.type) {
        MessageType.IMAGE -> when (message.mediaMime) { "image/png" -> "png"; "image/webp" -> "webp"; else -> "jpg" }
        MessageType.VIDEO -> "mp4"
        else -> null
    }
    return message.copy(mediaUrl = url, mediaUrls = emptyList(),
        // A local album path belongs to the primary image only.
        localMediaPath = if (url == message.mediaUrl) message.localMediaPath else null,
        text = extension?.let { "GaGa-${message.serverMessageId ?: message.localId}.$it" } ?: message.text,
        mediaMime = message.mediaMime ?: when (message.type) {
            MessageType.IMAGE -> "image/jpeg"; MessageType.VIDEO -> "video/mp4"; else -> null
        })
}

/** Forwarding two different members of an album must not share an idempotency key. */
internal fun selectedMediaMessage(message: Message, url: String?): Message = message.copy(
    clientMessageId = if (message.isMultiImage && url != null)
        message.clientMessageId + "-image-" + MessageDigest.getInstance("SHA-256").digest(url.toByteArray()).take(8).joinToString("") { "%02x".format(it) }
        else message.clientMessageId,
    mediaUrl = url, mediaUrls = emptyList(),
    localMediaPath = if (url == message.mediaUrl) message.localMediaPath else null,
)

internal fun contactSections(people: List<User>, query: String): Map<String, List<User>> = people
    .distinctBy { it.id }
    .filter { query.isBlank() || it.displayLabel.contains(query.trim(), true) || it.username.orEmpty().contains(query.trim(), true) }
    .sortedBy { it.displayLabel.lowercase(Locale.ROOT) }
    .groupBy { it.displayLabel.firstOrNull()?.uppercaseChar()?.takeIf { c -> c in 'A'..'Z' }?.toString() ?: "#" }

internal fun reusableAttachments(messages: List<Message>): List<Message> = messages
    .filter { it.type in setOf(MessageType.FILE, MessageType.AUDIO) && !it.isDeleted && !it.hiddenForMe && !it.mediaUrl.isNullOrBlank() }
    .distinctBy { it.serverMessageId ?: it.localId }
    .sortedByDescending { it.sortTimestamp }
