package app.gagachat.feature.chat.presentation

import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageType
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatUiPolicyTest {
    @Test fun mediaAndDocumentsOpenInViewer() {
        assertTrue(MessageType.IMAGE.opensMediaViewer())
        assertTrue(MessageType.VIDEO.opensMediaViewer())
        assertTrue(MessageType.FILE.opensMediaViewer())
    }

    @Test fun actionableCardsStayOutOfMediaViewer() {
        listOf(
            MessageType.TEXT,
            MessageType.AUDIO,
            MessageType.LOCATION,
            MessageType.CONTACT,
            MessageType.CALL_EVENT,
        ).forEach { assertFalse(it.opensMediaViewer()) }
    }

    private fun message(
        id: String,
        sender: String,
        at: Long,
    ) = Message(
        localId = id,
        clientMessageId = id,
        conversationId = "c1",
        senderId = sender,
        createdAtClient = at,
    )

    private val window = 5 * 60 * 1000L

    @Test fun sameSenderWithinWindowContinuesRun() {
        val first = message("m1", "alice", 1_000_000L)
        val second = message("m2", "alice", 1_000_000L + 60_000L)
        assertTrue(continuesRun(first, second, window))
    }

    @Test fun differentSenderBreaksRun() {
        val first = message("m1", "alice", 1_000_000L)
        val second = message("m2", "bob", 1_000_060_000L)
        assertFalse(continuesRun(first, second, window))
    }

    @Test fun gapBeyondWindowBreaksRun() {
        val first = message("m1", "alice", 1_000_000L)
        val second = message("m2", "alice", 1_000_000L + window + 1)
        assertFalse(continuesRun(first, second, window))
    }

    @Test fun firstMessageHasNoPreviousRun() {
        assertFalse(continuesRun(null, message("m1", "alice", 1_000_000L), window))
    }

    @Test fun avatarOnlyOnNewestMessageOfRun() {
        val older = message("m1", "alice", 1_000_000L)
        val newer = message("m2", "alice", 1_000_030_000L)
        // `newer` is drawn below `older`, so `older` is not the run end.
        assertFalse(endsRun(newer, older))
        assertTrue(endsRun(null, newer))
    }

    @Test fun senderChangeEndsRun() {
        val mine = message("m1", "alice", 1_000_000L)
        val theirs = message("m2", "bob", 1_000_030_000L)
        assertTrue(endsRun(theirs, mine))
    }

    @Test fun forwardingDoesNotSilentlyDiscardMultiSelection() {
        assertFalse(canForwardSelection(0))
        assertTrue(canForwardSelection(1))
        assertFalse(canForwardSelection(2))
        assertFalse(canForwardSelection(10))
    }
}
