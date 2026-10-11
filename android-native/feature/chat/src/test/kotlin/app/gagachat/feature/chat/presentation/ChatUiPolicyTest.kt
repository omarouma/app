package app.gagachat.feature.chat.presentation

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

    @Test fun forwardingDoesNotSilentlyDiscardMultiSelection() {
        assertFalse(canForwardSelection(0))
        assertTrue(canForwardSelection(1))
        assertFalse(canForwardSelection(2))
        assertFalse(canForwardSelection(10))
    }
}
