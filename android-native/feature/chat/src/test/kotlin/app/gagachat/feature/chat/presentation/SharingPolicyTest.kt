package app.gagachat.feature.chat.presentation

import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageType
import app.gagachat.core.model.User
import org.junit.Assert.*
import org.junit.Test

class SharingPolicyTest {
    private fun message(id: String, url: String = "https://example.test/$id") = Message(
        localId = id, clientMessageId = id, conversationId = "chat", senderId = "sender",
        type = MessageType.FILE, text = "same-name.pdf", mediaUrl = url)

    @Test fun sameFilenameNeverReusesOtherMessageOrAccountBytes() {
        val a = message("one")
        val b = message("two")
        assertNotEquals(attachmentCacheKey("alice", a), attachmentCacheKey("alice", b))
        assertNotEquals(attachmentCacheKey("alice", a), attachmentCacheKey("bob", a))
        assertEquals(attachmentCacheKey("alice", a), attachmentCacheKey("alice", a.copy(text = "renamed.pdf")))
    }

    @Test fun secondaryAlbumImageNeverUsesPrimaryLocalBytes() {
        val album = message("album", "first").copy(type = MessageType.IMAGE, localMediaPath = "/primary.jpg", mediaUrls = listOf("second"))
        val selected = mediaActionMessage(album, "second")
        assertEquals("second", selected.mediaUrl)
        assertNull(selected.localMediaPath)
        assertTrue(selected.mediaUrls.isEmpty())
        assertTrue(selected.text!!.endsWith(".jpg"))
        assertNotEquals(selectedMediaMessage(album, "first").clientMessageId, selectedMediaMessage(album, "second").clientMessageId)
    }

    @Test fun sectionsSearchUnicodeAndDeduplicateByIdentity() {
        val users = listOf(User("a", "Alice"), User("a", "Alice"), User("c", "欧玛", username = "gaga"), User("b", "Bob"))
        assertEquals(listOf("A", "B", "#"), contactSections(users, "").keys.toList())
        assertEquals(listOf("c"), contactSections(users, "gaga").values.flatten().map { it.id })
        assertEquals(3, contactSections(users, "").values.sumOf { it.size })
    }

    @Test fun deletedHiddenAndUnsyncedFilesCannotBeSelected() {
        val good = message("one")
        val rows = listOf(good, good.copy(localId = "hidden", hiddenForMe = true),
            message("deleted").copy(deletedAt = 1), message("pending").copy(mediaUrl = null),
            message("photo").copy(type = MessageType.IMAGE))
        assertEquals(listOf(good), reusableAttachments(rows))
    }
}
