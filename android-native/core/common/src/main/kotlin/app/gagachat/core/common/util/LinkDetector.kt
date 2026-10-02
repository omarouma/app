package app.gagachat.core.common.util

/**
 * Lightweight URL detection for chat text (spec area 13).
 *
 * Deliberately conservative: only `http`/`https` URLs are matched, trailing
 * punctuation is trimmed, and at most one URL per message is surfaced so a
 * message never spawns multiple preview cards.
 */
object LinkDetector {

    private val URL_REGEX = Regex(
        """https?://[^\s<>"'\)\]]+""",
        RegexOption.IGNORE_CASE,
    )

    /** Returns the first http(s) URL in [text], or `null`. */
    fun firstUrl(text: String?): String? {
        if (text.isNullOrBlank()) return null
        val match = URL_REGEX.find(text)?.value ?: return null
        return match.trimEnd('.', ',', ';', ':', '!', '?', ')', ']', '}', '\u201d', '\u2019')
            .takeIf { it.length > "https://".length }
    }

    fun hasUrl(text: String?): Boolean = firstUrl(text) != null
}
