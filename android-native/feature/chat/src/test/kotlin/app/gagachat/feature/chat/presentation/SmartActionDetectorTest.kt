package app.gagachat.feature.chat.presentation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import app.gagachat.core.model.SplitBillMath
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
    fun moneySuggestsSplitAndExtractsCurrency() {
        val result = SmartActionDetector.detect("Rahim paid ৳2,400 for dinner.", isGroup = true)
        assertTrue(result.any { it.kind == SmartActionKind.SPLIT_BILL })
        assertEquals("2400", SmartActionDetector.money("Rahim paid ৳2,400")?.amountText)
        assertEquals("BDT", SmartActionDetector.money("Rahim paid ৳2,400")?.currency)
        assertEquals(listOf(60000L,60000L,60000L,60000L), SplitBillMath.equalShares(240000L,4))
    }

    @Test
    fun mapLinkSuggestsLocationAction() {
        val result = SmartActionDetector.detect("Meet here https://maps.app.goo.gl/abc123", isGroup = true)
        assertTrue(result.any { it.kind == SmartActionKind.LOCATION })
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
    fun banglaTomorrowSuggestsEvent() {
        val result = SmartActionDetector.detect("আগামীকাল ক্লাস আছে সকাল ১০টায়", isGroup = true)
        assertTrue(result.any { it.kind == SmartActionKind.EVENT })
    }

    @Test
    fun chineseReminderLanguageSuggestsTask() {
        val result = SmartActionDetector.detect("请记得明天发送报价", isGroup = false)
        assertTrue(result.any { it.kind == SmartActionKind.TASK })
        assertTrue(result.any { it.kind == SmartActionKind.EVENT })
    }

    @Test
    fun blankTextHasNoSuggestions() {
        assertTrue(SmartActionDetector.detect("   ", isGroup = true).isEmpty())
    }
}
