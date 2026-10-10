package app.gagachat.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

class SmartActionDraftTest {
    private val zone = ZoneId.of("Asia/Dhaka")
    // 2026-10-10T06:00:00Z == 12:00 in Dhaka.
    private val now = Instant.parse("2026-10-10T06:00:00Z")

    @Test fun readsBanglaTakaAmountAndCurrency() {
        val money = SmartActionDraft.money("Rahim paid ৳2,400 for dinner.")
        assertEquals("2400", money?.amountText)
        assertEquals("BDT", money?.currency)
        assertEquals(240000L, SmartActionDraft.amountMinor("Rahim paid ৳2,400 for dinner."))
    }

    @Test fun readsUsdAndCnyPrefixes() {
        assertEquals("USD", SmartActionDraft.money("$50 deposit")?.currency)
        assertEquals("CNY", SmartActionDraft.money("¥120 lunch")?.currency)
        assertEquals("CNY", SmartActionDraft.money("120 rmb lunch")?.currency)
    }

    @Test fun currencyDefaultsToBdtWhenNoMoney() {
        assertEquals("BDT", SmartActionDraft.currency("just a note"))
        assertNull(SmartActionDraft.money("just a note"))
    }

    @Test fun titleCollapsesWhitespaceAndCapsLength() {
        assertEquals("Submit the report", SmartActionDraft.title("  Submit   the\nreport  ", "Task"))
        assertEquals("Task", SmartActionDraft.title("   ", "Task"))
        assertEquals(160, SmartActionDraft.title("x".repeat(400), "Task").length)
    }

    @Test fun tomorrowWithClockResolvesToNextDay() {
        // "tomorrow at 10 am" from 12:00 Dhaka -> 2026-10-11T10:00+06:00 == 04:00Z
        val due = SmartActionDraft.dueAt("class tomorrow at 10 am", now, zone)
        assertEquals("2026-10-11T04:00:00Z", due)
    }

    @Test fun bareFutureTimeStaysToday() {
        // 14:30 Dhaka on 2026-10-10 == 08:30Z, which is after `now`.
        val due = SmartActionDraft.dueAt("call at 14:30", now, zone)
        assertEquals("2026-10-10T08:30:00Z", due)
    }

    @Test fun barePastTimeRollsToTomorrow() {
        // 09:00 Dhaka has already passed at 12:00 Dhaka, so it rolls to the 11th.
        val due = SmartActionDraft.dueAt("standup at 9 am", now, zone)
        assertEquals("2026-10-11T03:00:00Z", due)
    }

    @Test fun weekdayResolvesToNextOccurrence() {
        // now is Saturday 2026-10-10; "monday" -> 2026-10-12 at default 09:00 Dhaka == 03:00Z
        val due = SmartActionDraft.dueAt("meeting monday", now, zone)
        assertEquals("2026-10-12T03:00:00Z", due)
    }

    @Test fun chineseTomorrowResolves() {
        // 明天 (tomorrow) at default 09:00 Dhaka -> 2026-10-11T03:00:00Z
        val due = SmartActionDraft.dueAt("明天提交报价", now, zone)
        assertEquals("2026-10-11T03:00:00Z", due)
    }

    @Test fun noDateOrTimeYieldsNull() {
        assertNull(SmartActionDraft.dueAt("just a plain sentence", now, zone))
        assertNull(SmartActionDraft.dueAt(null, now, zone))
    }

    @Test fun dedupeIdIsStablePerMessageAndKind() {
        val a = SmartActionDraft.dedupeId("user-1", "msg-9", "task")
        val b = SmartActionDraft.dedupeId("user-1", "msg-9", "task")
        val c = SmartActionDraft.dedupeId("user-1", "msg-9", "event")
        assertEquals(a, b)
        assertTrue(a != c)
        // Valid UUID so it satisfies the `uuid` primary key column.
        assertEquals(36, a.length)
    }
}
