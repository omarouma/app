package app.gagachat.core.model

import org.junit.Assert.*
import org.junit.Test

class DailyMoneyTest {
    @Test fun acceptsExactMinorUnits() {
        assertEquals(12345L, DailyMoney.parseMinor("123.45"))
        assertEquals(10L, DailyMoney.parseMinor("0.10"))
        assertEquals(100L, DailyMoney.parseMinor("1"))
    }
    @Test fun rejectsRoundingNegativeAndOverflow() {
        listOf("", "0", "-2", "0.001", "NaN", "1000000000.01", "999999999999999999999").forEach { assertNull(it, DailyMoney.parseMinor(it)) }
    }
    @Test fun formatsWithoutFloatingPointDrift() {
        assertEquals("0.10", DailyMoney.format(10))
        assertEquals("-1.25", DailyMoney.format(-125))
        assertEquals("123.45", DailyMoney.format(12345))
    }
}
