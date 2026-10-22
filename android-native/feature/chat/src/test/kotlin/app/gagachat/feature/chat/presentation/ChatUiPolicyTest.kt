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

    /**
     * Fixed epoch used by the grouping tests. A small, round value such as
     * 1_000_000L is only ~16 minutes past the epoch, so a 30s offset is still
     * 1 Jan 1970 -- but a larger one silently crosses a day boundary and the
     * test then fails for the wrong reason. Every offset below is under six
     * minutes, so all of them stay on one calendar day in any timezone.
     */
    private val t0 = 1_700_000_000_000L

    @Test fun sameSenderWithinWindowContinuesRun() {
        val first = message("m1", "alice", t0)
        val second = message("m2", "alice", t0 + 60_000L)
        assertTrue(continuesRun(first, second, window))
    }

    @Test fun differentSenderBreaksRun() {
        val first = message("m1", "alice", t0)
        val second = message("m2", "bob", t0 + 60_000L)
        assertFalse(continuesRun(first, second, window))
    }

    @Test fun gapBeyondWindowBreaksRun() {
        val first = message("m1", "alice", t0)
        val second = message("m2", "alice", t0 + window + 1)
        assertFalse(continuesRun(first, second, window))
    }

    @Test fun firstMessageHasNoPreviousRun() {
        assertFalse(continuesRun(null, message("m1", "alice", t0), window))
    }

    @Test fun avatarOnlyOnNewestMessageOfRun() {
        val older = message("m1", "alice", t0)
        val newer = message("m2", "alice", t0 + 30_000L)
        // `newer` is drawn below `older`, so `older` is not the run end.
        assertFalse(endsRun(newer, older, window))
        assertTrue(endsRun(null, newer, window))
    }

    @Test fun timeGapEndsRunAndShowsAvatarAgain() {
        val older = message("m1", "alice", t0)
        val newer = message("m2", "alice", t0 + window + 1)
        assertTrue(endsRun(newer, older, window))
    }

    @Test fun senderChangeEndsRun() {
        val mine = message("m1", "alice", t0)
        val theirs = message("m2", "bob", t0 + 30_000L)
        assertTrue(endsRun(theirs, mine, window))
    }

    @Test fun forwardingDoesNotSilentlyDiscardMultiSelection() {
        assertFalse(canForwardSelection(0))
        assertTrue(canForwardSelection(1))
        assertFalse(canForwardSelection(2))
        assertFalse(canForwardSelection(10))
    }
}
