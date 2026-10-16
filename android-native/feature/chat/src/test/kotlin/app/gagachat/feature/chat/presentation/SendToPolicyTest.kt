package app.gagachat.feature.chat.presentation

import app.gagachat.core.model.Conversation
import app.gagachat.core.model.ConversationMember
import app.gagachat.core.model.ConversationType
import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageType
import app.gagachat.core.model.User
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SendToPolicyTest {

    private val me = "me"

    private fun directChat(id: String, otherId: String, otherName: String) = Conversation(
        id = id,
        type = ConversationType.DIRECT,
        members = listOf(
            ConversationMember(conversationId = id, userId = me, displayName = "Me"),
            ConversationMember(conversationId = id, userId = otherId, displayName = otherName),
        ),
    )

    private fun groupChat(id: String, title: String) = Conversation(
        id = id,
        type = ConversationType.GROUP,
        title = title,
        members = listOf(ConversationMember(conversationId = id, userId = me, displayName = "Me")),
    )

    private fun user(id: String, name: String, username: String? = null) =
        User(id = id, displayName = name, username = username)

    @Test
    fun `idempotency key is stable per source and destination`() {
        val a = forwardIdempotencyKey("src-1", "chat:1")
        val b = forwardIdempotencyKey("src-1", "chat:1")
        assertEquals(a, b)
    }

    @Test
    fun `idempotency key differs across destinations and sources`() {
        val base = forwardIdempotencyKey("src-1", "chat:1")
        assertNotEquals(base, forwardIdempotencyKey("src-1", "chat:2"))
        assertNotEquals(base, forwardIdempotencyKey("src-2", "chat:1"))
    }

    @Test
    fun `destinations list chats first then contacts`() {
        val result = buildForwardDestinations(
            conversations = listOf(directChat("c1", "u1", "Alice"), groupChat("g1", "Team")),
            contacts = listOf(user("u2", "Bob")),
            currentUserId = me,
        )
        assertEquals(listOf("chat:c1", "chat:g1", "user:u2"), result.map { it.key })
        assertEquals("Alice", result[0].title)
        assertFalse(result[0].isGroup)
        assertTrue(result[1].isGroup)
        assertEquals("Bob", result[2].title)
    }

    @Test
    fun `contacts already in a direct chat are not duplicated`() {
        val result = buildForwardDestinations(
            conversations = listOf(directChat("c1", "u1", "Alice")),
            contacts = listOf(user("u1", "Alice"), user("u2", "Bob")),
            currentUserId = me,
        )
        assertEquals(listOf("chat:c1", "user:u2"), result.map { it.key })
    }

    @Test
    fun `current user is excluded from destinations`() {
        val result = buildForwardDestinations(
            conversations = emptyList(),
            contacts = listOf(user("me", "Me"), user("u2", "Bob")),
            currentUserId = me,
        )
        assertEquals(listOf("user:u2"), result.map { it.key })
    }

    @Test
    fun `filter matches title and subtitle case-insensitively`() {
        val destinations = listOf(
            ForwardDestination("chat:1", "Alice", "See you soon", false, "1", "u1", null),
            ForwardDestination("user:2", "Bob", "@bobby", false, null, "u2", null),
        )
        assertEquals(listOf("chat:1"), filterForwardDestinations(destinations, "alice").map { it.key })
        assertEquals(listOf("user:2"), filterForwardDestinations(destinations, "BOBBY").map { it.key })
        assertEquals(destinations, filterForwardDestinations(destinations, "  "))
    }

    @Test
    fun `preview label uses text when present`() {
        val message = Message(
            localId = "l1",
            clientMessageId = "l1",
            conversationId = "c1",
            senderId = me,
            type = MessageType.TEXT,
            text = "Hello there",
        )
        assertEquals("Hello there", forwardPreviewLabel(message))
    }

    @Test
    fun `preview label falls back to type for media`() {
        fun messageOf(type: MessageType) = Message(
            localId = "l1",
            clientMessageId = "l1",
            conversationId = "c1",
            senderId = me,
            type = type,
        )
        assertEquals("\uD83D\uDCF7 Photo", forwardPreviewLabel(messageOf(MessageType.IMAGE)))
        assertEquals("\uD83C\uDFA5 Video", forwardPreviewLabel(messageOf(MessageType.VIDEO)))
        assertEquals("\uD83D\uDCCD Location", forwardPreviewLabel(messageOf(MessageType.LOCATION)))
        assertEquals("\uD83D\uDC64 Contact card", forwardPreviewLabel(messageOf(MessageType.CONTACT)))
    }
}
