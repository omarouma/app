package app.gagachat.core.model

import java.time.Instant
import java.time.ZoneId

/** One clock snapshot keeps Today counts and sections consistent at day boundaries. */
class TodayTimePolicy(private val now: Instant, private val zone: ZoneId) {
    private fun parse(value: String?): Instant? = value?.let {
        runCatching { Instant.parse(it) }.getOrNull()
    }
    fun isDueToday(value: String?): Boolean = parse(value)?.atZone(zone)?.toLocalDate() == now.atZone(zone).toLocalDate()
    fun isOverdue(value: String?): Boolean = parse(value)?.isBefore(now) == true
    fun isUpcoming(value: String?): Boolean = parse(value)?.let { !it.isBefore(now) } == true
}
