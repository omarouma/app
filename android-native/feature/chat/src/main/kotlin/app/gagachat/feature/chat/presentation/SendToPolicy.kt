package app.gagachat.feature.chat.presentation

import app.gagachat.core.model.Conversation
import app.gagachat.core.model.ConversationType
import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageType
import app.gagachat.core.model.User
import java.util.UUID

/**
 * One selectable destination in the Send-to selector.
 *
 * A destination is either an existing chat ([conversationId] != null) or a known
 * contact with no chat yet ([userId] != null, [conversationId] == null). The
 * stable [key] is what selection state and the idempotency key are built from.
 */
data class ForwardDestination(
    val key: String,
    val title: String,
    val subtitle: String?,
    val isGroup: Boolean,
    val conversationId: String?,
    val userId: String?,
    val avatarUrl: String?,
)

/**
 * Deterministic idempotency key for forwarding a source message to a
 * destination. The same (source, destination) pair always yields the same key,
 * so a retry or a double-tap replaces the same message row instead of creating a
 * duplicate delivery.
 */
internal fun forwardIdempotencyKey(sourceClientId: String, destinationKey: String): String =
    "fwd-" + UUID.nameUUIDFromBytes("$sourceClientId|$destinationKey".toByteArray()).toString()

/**
 * Merges the user's existing chats with known contacts into a single ordered,
 * de-duplicated destination list.
 *
 * Existing chats win (they already carry the resolved conversation id). Contacts
 * that are already represented by a direct chat are dropped so the same person
 * never appears twice, and the signed-in user is always excluded.
 */
internal fun buildForwardDestinations(
    conversations: List<Conversation>,
    contacts: List<User>,
    currentUserId: String,
): List<ForwardDestination> {
    val chatDestinations = conversations.map { conversation ->
        val isGroup = conversation.type != ConversationType.DIRECT
        val other = if (isGroup) null else conversation.otherMember(currentUserId)
        ForwardDestination(
            key = "chat:${conversation.id}",
            title = conversation.displayTitle(currentUserId),
            subtitle = conversation.lastMessagePreview?.takeIf { it.isNotBlank() },
            isGroup = isGroup,
            conversationId = conversation.id,
            userId = other?.userId,
            avatarUrl = conversation.avatar ?: other?.avatar,
        )
    }

    // User ids already covered by a direct chat, so contacts don't duplicate.
    val coveredUserIds = chatDestinations.mapNotNull { it.userId }.toSet()
    val contactDestinations = contacts
        .asSequence()
        .filter { it.id != currentUserId && it.id !in coveredUserIds }
        .map { user ->
            ForwardDestination(
                key = "user:${user.id}",
                title = user.displayLabel,
                subtitle = user.username?.takeIf { it.isNotBlank() }?.let { "@$it" },
                isGroup = false,
                conversationId = null,
                userId = user.id,
                avatarUrl = user.avatar,
            )
        }
        .toList()

    return (chatDestinations + contactDestinations).distinctBy { it.key }
}

/** Case-insensitive search across a destination's title and subtitle. */
internal fun filterForwardDestinations(
    destinations: List<ForwardDestination>,
    query: String,
): List<ForwardDestination> {
    val trimmed = query.trim()
    if (trimmed.isEmpty()) return destinations
    return destinations.filter { destination ->
        destination.title.contains(trimmed, ignoreCase = true) ||
            destination.subtitle?.contains(trimmed, ignoreCase = true) == true
    }
}

/**
 * A short, human label describing what is being sent, used on the confirmation
 * step so the user can see exactly what will be delivered before tapping Send.
 */
internal fun forwardPreviewLabel(message: Message): String {
    val text = message.text?.trim().orEmpty()
    if (text.isNotEmpty()) return text
    return when (message.type) {
        MessageType.IMAGE -> "\uD83D\uDCF7 Photo"
        MessageType.VIDEO -> "\uD83C\uDFA5 Video"
        MessageType.AUDIO -> "\uD83C\uDFA4 Voice message"
        MessageType.LOCATION -> "\uD83D\uDCCD Location"
        MessageType.CONTACT -> "\uD83D\uDC64 Contact card"
        MessageType.FILE -> "\uD83D\uDCCE File"
        else -> "\uD83D\uDCE4 Message"
    }
}
