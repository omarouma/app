package app.gagachat.core.model

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationSoundPolicyTest {
    @Test fun respectsMutedChatEvenWhenGlobalSoundsEnabled() {
        assertFalse(NotificationSoundPolicy.mayPlayMessageTone(true, true, true, true))
    }

    @Test fun respectsEachIndependentPreference() {
        assertFalse(NotificationSoundPolicy.mayPlayMessageTone(false, true, true, false))
        assertFalse(NotificationSoundPolicy.mayPlayMessageTone(true, false, true, false))
        assertFalse(NotificationSoundPolicy.mayPlayMessageTone(true, true, false, false))
        assertTrue(NotificationSoundPolicy.mayPlayMessageTone(true, true, true, false))
    }
}
