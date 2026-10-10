package app.gagachat.core.model

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.UUID

/** A money amount read out of a chat message, as raw digits plus a currency code. */
data class ParsedMoney(val amountText: String, val currency: String)

/**
 * V3.0 Sprint C (checklist row #14 — Chat-to-Action: "Task/reminder/event drafts").
 *
 * Pure, dependency-free parsing that turns a chat message into a *draft* GaGa
 * Today record: a cleaned title, an optional due instant and an optional money
 * amount/currency, plus a deterministic id used to guarantee a confirmed action
 * is stored **exactly once**.
 *
 * It lives in `core:model` so the chat feature (which offers the action) and the
 * Daily Life editor (which stores it) share one implementation and one test
 * suite. It is deliberately conservative: when a value cannot be read with
 * confidence it returns `null` and the caller keeps its own default, so a
 * mis-parse can never invent a wrong deadline or amount.
 */
object SmartActionDraft {

    /** Leading or trailing currency token plus the numeric amount. */
    private val money = Regex(
        """(?i)(৳|bdt|tk\.?|taka|টাকা|usd|\$|cny|rmb|¥|元|人民币)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(bdt|tk\.?|taka|টাকা|usd|cny|rmb|¥|元|人民币)"""
    )

    /** `14:30`, `14:30pm`, `2pm`, `9 am` — 24h or 12h with an explicit meridian. */
    private val clock = Regex(
        """\b(?:(?<h24>[01]?\d|2[0-3]):(?<m>[0-5]\d)\s*(?<ap24>am|pm)?|(?<h12>0?[1-9]|1[0-2])\s*(?<ap12>am|pm))\b"""
    )

    private val weekdays = mapOf(
        "monday" to DayOfWeek.MONDAY, "tuesday" to DayOfWeek.TUESDAY,
        "wednesday" to DayOfWeek.WEDNESDAY, "thursday" to DayOfWeek.THURSDAY,
        "friday" to DayOfWeek.FRIDAY, "saturday" to DayOfWeek.SATURDAY,
        "sunday" to DayOfWeek.SUNDAY,
    )

    private val chineseWeekdays = mapOf(
        "星期一" to DayOfWeek.MONDAY, "星期二" to DayOfWeek.TUESDAY,
        "星期三" to DayOfWeek.WEDNESDAY, "星期四" to DayOfWeek.THURSDAY,
        "星期五" to DayOfWeek.FRIDAY, "星期六" to DayOfWeek.SATURDAY,
        "星期日" to DayOfWeek.SUNDAY, "星期天" to DayOfWeek.SUNDAY,
    )

    /** Reads a money amount from a message, or null when none is present. */
    fun money(text: String?): ParsedMoney? {
        val match = money.find(text.orEmpty()) ?: return null
        val token = (match.groups[1]?.value ?: match.groups[4]?.value).orEmpty().lowercase()
        val amount = (match.groups[2]?.value ?: match.groups[3]?.value)?.replace(",", "") ?: return null
        val currency = when {
            token in listOf("$", "usd") -> "USD"
            token in listOf("¥", "cny", "rmb", "元", "人民币") -> "CNY"
            else -> "BDT"
        }
        return ParsedMoney(amount, currency)
    }

    /** The amount as exact minor units (e.g. "2,400" -> 240000), or null. */
    fun amountMinor(text: String?): Long? = money(text)?.let { DailyMoney.parseMinor(it.amountText) }

    /** The detected currency, defaulting to the app's primary currency. */
    fun currency(text: String?): String = money(text)?.currency ?: "BDT"

    /**
     * A concise, single-line title for the draft: whitespace collapsed and
     * capped at the schema's 160-character limit, or [fallback] when the message
     * has no usable text.
     */
    fun title(text: String?, fallback: String): String {
        val cleaned = text.orEmpty().replace(Regex("\\s+"), " ").trim().take(160)
        return cleaned.ifBlank { fallback }
    }

    /**
     * The due instant (ISO-8601 UTC) implied by a message, or null when the
     * message carries no usable date/time. Supports today/tomorrow/tonight,
     * English + Chinese weekday names, and an explicit clock time; when only a
     * time is given and it has already passed today, it rolls to tomorrow.
     */
    fun dueAt(text: String?, now: Instant, zone: ZoneId): String? {
        val raw = text.orEmpty().lowercase()
        if (raw.isBlank()) return null
        val today = now.atZone(zone).toLocalDate()

        var date: LocalDate? = when {
            containsAny(raw, "tomorrow", "আগামীকাল", "কাল", "明天") -> today.plusDays(1)
            containsAny(raw, "tonight", "this evening", "今晚") -> today
            containsAny(raw, "today", "this morning", "this afternoon", "আজ", "今天") -> today
            else -> null
        }
        if (date == null) {
            weekdays.forEach { (name, dow) -> if (date == null && raw.contains(name)) date = nextWeekday(today, dow) }
            chineseWeekdays.forEach { (name, dow) -> if (date == null && raw.contains(name)) date = nextWeekday(today, dow) }
        }

        val time = parseTime(raw)
        if (date == null && time == null) return null

        var resolved = ZonedDateTime.of(date ?: today, time ?: LocalTime.of(9, 0), zone)
        // A bare time that has already passed refers to the next occurrence.
        if (date == null && resolved.toInstant().isBefore(now)) resolved = resolved.plusDays(1)
        return resolved.toInstant().toString()
    }

    /**
     * A stable id for an action derived from a specific message. Confirming the
     * same message for the same kind always yields the same id, so the record is
     * stored exactly once (the server inserts with `resolution=ignore-duplicates`
     * and the editor short-circuits when it already holds the row).
     */
    fun dedupeId(ownerId: String, sourceMessage: String?, kind: String): String =
        UUID.nameUUIDFromBytes("gaga-action:$ownerId:$kind:${sourceMessage.orEmpty()}".toByteArray()).toString()

    private fun containsAny(raw: String, vararg needles: String): Boolean = needles.any { raw.contains(it) }

    private fun nextWeekday(today: LocalDate, target: DayOfWeek): LocalDate {
        val ahead = (target.value - today.dayOfWeek.value + 7) % 7
        return today.plusDays(if (ahead == 0) 7L else ahead.toLong())
    }

    private fun parseTime(raw: String): LocalTime? {
        val match = clock.find(raw) ?: return null
        val h24 = match.groups["h24"]?.value
        return if (h24 != null) {
            var hour = h24.toInt()
            val minute = match.groups["m"]!!.value.toInt()
            when (match.groups["ap24"]?.value) {
                "pm" -> if (hour < 12) hour += 12
                "am" -> if (hour == 12) hour = 0
            }
            LocalTime.of(hour, minute)
        } else {
            var hour = match.groups["h12"]!!.value.toInt()
            if (match.groups["ap12"]!!.value == "pm" && hour < 12) hour += 12
            if (match.groups["ap12"]!!.value == "am" && hour == 12) hour = 0
            LocalTime.of(hour, 0)
        }
    }
}
