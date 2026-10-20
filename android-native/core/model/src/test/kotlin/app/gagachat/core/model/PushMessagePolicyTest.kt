package app.gagachat.core.model

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PushMessagePolicyTest {
    @Test fun locallyMutedChatsSuppressBackgroundMessageAlerts() {
        assertFalse(PushMessagePolicy.shouldDisplay(true))
        assertTrue(PushMessagePolicy.shouldDisplay(false))
        assertTrue(PushMessagePolicy.shouldDisplay(null))
    }

    @Test fun locallyKnownGroupAndChannelUseGroupNotifications() {
        assertTrue(PushMessagePolicy.isGroup("GROUP", mapOf("type" to "message")))
        assertTrue(PushMessagePolicy.isGroup("channel", mapOf("type" to "message")))
        assertFalse(PushMessagePolicy.isGroup("DIRECT", mapOf("type" to "message")))
    }

    @Test fun knownDirectChatOverridesWrongGroupHint() {
        assertFalse(PushMessagePolicy.isGroup("direct", mapOf("isGroup" to "true")))
    }

    @Test fun unknownChatUsesBackendGroupHintForColdCache() {
        assertTrue(PushMessagePolicy.isGroup(null, mapOf("type" to "message", "is_group" to "true")))
        assertTrue(PushMessagePolicy.isGroup(null, mapOf("type" to "group_message")))
        assertFalse(PushMessagePolicy.isGroup(null, mapOf("type" to "message")))
    }
}
