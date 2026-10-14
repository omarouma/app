package app.gagachat.core.model

import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.*
import org.junit.Test

class TodayTimePolicyTest {
    private val time = TodayTimePolicy(Instant.parse("2026-10-14T18:00:00Z"), ZoneId.of("Asia/Dhaka"))
    @Test fun dhakaMidnightUsesLocalDay() {
        assertFalse(time.isDueToday("2026-10-14T17:59:59Z"))
        assertTrue(time.isDueToday("2026-10-14T18:00:00Z"))
        assertTrue(time.isDueToday("2026-10-15T17:59:59Z"))
        assertFalse(time.isDueToday("2026-10-15T18:00:00Z"))
    }
    @Test fun exactDeadlineIsUpcomingAndNotOverdue() {
        assertTrue(time.isUpcoming("2026-10-14T18:00:00Z"))
        assertFalse(time.isOverdue("2026-10-14T18:00:00Z"))
        assertTrue(time.isOverdue("2026-10-14T17:59:59Z"))
        assertFalse(time.isUpcoming("2026-10-14T17:59:59Z"))
    }
    @Test fun missingOrMalformedDatesAreNotScheduled() {
        for (date in listOf(null, "", "not-a-date")) {
            assertFalse(time.isDueToday(date))
            assertFalse(time.isOverdue(date))
            assertFalse(time.isUpcoming(date))
        }
    }
}
