package app.gagachat.feature.chat.presentation

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatPlanSuggestionTest {
    @Test fun suggestsOnlyWhenMessageContainsPlanCues() {
        assertTrue(looksLikeAPlan("We have a meeting tomorrow at 10"))
        assertTrue(looksLikeAPlan("Can we meet at 8 PM?"))
        assertTrue(looksLikeAPlan("Class at 09:30 am"))
        assertFalse(looksLikeAPlan("Please send the document"))
        assertFalse(looksLikeAPlan("Hello!"))
    }

    @Test fun ignoresOversizedMessages() {
        assertFalse(looksLikeAPlan("meeting tomorrow " + "x".repeat(1200)))
    }
}
