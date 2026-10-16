package app.gagachat.feature.chat.presentation

import app.gagachat.feature.chat.presentation.components.*
import org.junit.Assert.*
import org.junit.Test

class ChatCardPolicyTest {
    @Test fun rejectsMissingNonFiniteAndOutOfRangeCoordinates() {
        assertTrue(validChatCoordinates(23.88355, 90.38782))
        for ((lat, lng) in listOf(null to 90.0, Double.NaN to 90.0, 23.0 to Double.POSITIVE_INFINITY, 91.0 to 90.0, 23.0 to 181.0)) {
            assertFalse(validChatCoordinates(lat, lng))
        }
    }
    @Test fun photoPreviewKeepsRealRatioWithinBoundedHeight() {
        assertEquals(1f, chatPhotoAspectRatio(500f, 500f), 0.001f)
        assertEquals(1.5f, chatPhotoAspectRatio(600f, 400f), 0.001f)
        assertEquals(0.85f, chatPhotoAspectRatio(100f, 1000f), 0.001f)
        assertEquals(4f / 3f, chatPhotoAspectRatio(Float.NaN, 0f), 0.001f)
    }
    @Test fun callCardsKeepVideoAndUnansweredOutcomesDistinct() {
        assertTrue(parseCallEvent("Missed video call").isVideo)
        assertEquals(CallOutcome.MISSED, parseCallEvent("Missed video call").outcome)
        assertEquals(CallOutcome.BUSY, parseCallEvent("Busy voice call").outcome)
        assertEquals("1m 20s", parseCallEvent("Answered video call • 1m 20s").durationText)
    }
}
