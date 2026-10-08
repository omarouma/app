package app.gagachat.feature.chat.presentation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SmartActionDetectorTest {
    @Test
    fun classTimeRanksEventAndReminder() {
        val result = SmartActionDetector.detect("We have class tomorrow at 10 am.", isGroup = true)
        assertEquals(SmartActionKind.EVENT, result.first().kind)
        assertTrue(result.any { it.kind == SmartActionKind.REMINDER })
    }

    @Test
    fun bangladeshMoneySuggestsExpense() {
        val result = SmartActionDetector.detect("Rahim paid ৳2,400 for dinner.", isGroup = false)
        assertTrue(result.any { it.kind == SmartActionKind.EXPENSE })
    }

    @Test
    fun groupQuestionSuggestsPoll() {
        val result = SmartActionDetector.detect("Which day should we meet?", isGroup = true)
        assertTrue(result.any { it.kind == SmartActionKind.POLL })
    }

    @Test
    fun ordinaryInstructionCanBecomeTask() {
        val result = SmartActionDetector.detect("Please send the quotation to Karim.", isGroup = false)
        assertTrue(result.any { it.kind == SmartActionKind.TASK })
    }

    @Test
    fun blankTextHasNoSuggestions() {
        assertTrue(SmartActionDetector.detect("   ", isGroup = true).isEmpty())
    }
}
