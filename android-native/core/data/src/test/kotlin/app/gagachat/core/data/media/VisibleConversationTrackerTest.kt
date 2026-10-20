package app.gagachat.core.data.media

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VisibleConversationTrackerTest {
    @Test fun onlyTheActiveUserAndConversationMatches() {
        val tracker = VisibleConversationTracker()
        tracker.show("account-a", "chat-1")
        assertTrue(tracker.isVisible("account-a", "chat-1"))
        assertFalse(tracker.isVisible("account-b", "chat-1"))
        assertFalse(tracker.isVisible("account-a", "chat-2"))
    }

    @Test fun oldRouteCannotClearANewVisibleConversation() {
        val tracker = VisibleConversationTracker()
        tracker.show("account-a", "chat-1")
        tracker.show("account-a", "chat-2")
        tracker.hide("account-a", "chat-1")
        assertTrue(tracker.isVisible("account-a", "chat-2"))
        tracker.hide("account-a", "chat-2")
        assertFalse(tracker.isVisible("account-a", "chat-2"))
    }
}
