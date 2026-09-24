package app.gagachat.core.ui.util

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Lightweight, allocation-conscious time formatting for chat surfaces.
 * Formatters are cached in a ThreadLocal because SimpleDateFormat is not
 * thread-safe and creating one per row would cause GC churn while scrolling.
 */
object TimeFormat {

    private val timeFormat = ThreadLocal.withInitial { SimpleDateFormat("h:mm a", Locale.getDefault()) }
    private val dayFormat = ThreadLocal.withInitial { SimpleDateFormat("MMM d", Locale.getDefault()) }
    private val fullFormat = ThreadLocal.withInitial { SimpleDateFormat("MMM d, yyyy", Locale.getDefault()) }

    /** e.g. "9:41 AM" — used inside message bubbles. */
    fun messageTime(epochMillis: Long): String =
        timeFormat.get()!!.format(Date(epochMillis))

    /** Compact timestamp for conversation list rows. */
    fun conversationTime(epochMillis: Long): String {
        val now = System.currentTimeMillis()
        val diff = now - epochMillis
        return when {
            diff < TimeUnit.MINUTES.toMillis(1) -> "now"
            diff < TimeUnit.HOURS.toMillis(1) -> "${TimeUnit.MILLISECONDS.toMinutes(diff)}m"
            isSameDay(epochMillis, now) -> timeFormat.get()!!.format(Date(epochMillis))
            isYesterday(epochMillis, now) -> "Yesterday"
            diff < TimeUnit.DAYS.toMillis(7) -> dayFormat.get()!!.format(Date(epochMillis))
            else -> dayFormat.get()!!.format(Date(epochMillis))
        }
    }

    /** Day separator label shown between message groups. */
    fun daySeparator(epochMillis: Long): String {
        val now = System.currentTimeMillis()
        return when {
            isSameDay(epochMillis, now) -> "Today"
            isYesterday(epochMillis, now) -> "Yesterday"
            else -> fullFormat.get()!!.format(Date(epochMillis))
        }
    }

    /** "last seen 5m ago" style presence text. */
    fun lastSeen(epochMillis: Long): String {
        val diff = System.currentTimeMillis() - epochMillis
        return when {
            diff < TimeUnit.MINUTES.toMillis(1) -> "last seen just now"
            diff < TimeUnit.HOURS.toMillis(1) -> "last seen ${TimeUnit.MILLISECONDS.toMinutes(diff)}m ago"
            diff < TimeUnit.DAYS.toMillis(1) -> "last seen ${TimeUnit.MILLISECONDS.toHours(diff)}h ago"
            else -> "last seen ${TimeUnit.MILLISECONDS.toDays(diff)}d ago"
        }
    }

    /** mm:ss for call duration. */
    fun callDuration(millis: Long): String {
        val totalSeconds = TimeUnit.MILLISECONDS.toSeconds(millis)
        val minutes = totalSeconds / 60
        val seconds = totalSeconds % 60
        return String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds)
    }

    private fun isSameDay(a: Long, b: Long): Boolean {
        val calA = Calendar.getInstance().apply { timeInMillis = a }
        val calB = Calendar.getInstance().apply { timeInMillis = b }
        return calA.get(Calendar.YEAR) == calB.get(Calendar.YEAR) &&
            calA.get(Calendar.DAY_OF_YEAR) == calB.get(Calendar.DAY_OF_YEAR)
    }

    private fun isYesterday(a: Long, b: Long): Boolean {
        val calA = Calendar.getInstance().apply { timeInMillis = a }
        val calB = Calendar.getInstance().apply { timeInMillis = b }
        calB.add(Calendar.DAY_OF_YEAR, -1)
        return calA.get(Calendar.YEAR) == calB.get(Calendar.YEAR) &&
            calA.get(Calendar.DAY_OF_YEAR) == calB.get(Calendar.DAY_OF_YEAR)
    }
}
