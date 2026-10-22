package app.gagachat.feature.chat.presentation

import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageType

/**
 * Presentation policy kept separate from the repository's media transport.
 * Media or documents can open their dedicated viewer; actionable content such
 * as calls, contacts, location cards and audio players must use their own UI.
 */
internal fun MessageType.opensMediaViewer(): Boolean = when (this) {
    MessageType.IMAGE, MessageType.VIDEO, MessageType.FILE -> true
    else -> false
}

/** The existing forward-picker supports exactly one message at a time. */
internal fun canForwardSelection(count: Int): Boolean = count == 1

/**
 * Messages from the same sender within [windowMs] are rendered as one visual
 * run: the avatar appears once, on the newest row, and the rows sit tighter
 * together. A day boundary always breaks the run so a date separator never
 * lands inside a grouped block.
 */
internal fun continuesRun(
    previous: Message?,
    current: Message,
    windowMs: Long,
): Boolean {
    if (previous == null) return false
    if (previous.senderId != current.senderId) return false
    if (!isSameCalendarDay(previous.sortTimestamp, current.sortTimestamp)) return false
    val delta = current.sortTimestamp - previous.sortTimestamp
    return delta in 0..windowMs
}

/**
 * True when [current] is the newest message of its run, i.e. the row that
 * should carry the sender avatar. [next] is the message drawn *below* it.
 */
internal fun endsRun(next: Message?, current: Message, windowMs: Long): Boolean =
    next == null || !continuesRun(current, next, windowMs)

/** Local-day comparison used for grouping; avoids a java.time dependency. */
internal fun isSameCalendarDay(a: Long, b: Long): Boolean {
    val zone = java.util.TimeZone.getDefault()
    fun dayOf(millis: Long): Int {
        val cal = java.util.Calendar.getInstance(zone)
        cal.timeInMillis = millis
        return cal.get(java.util.Calendar.YEAR) * 1000 +
            cal.get(java.util.Calendar.DAY_OF_YEAR)
    }
    return dayOf(a) == dayOf(b)
}
