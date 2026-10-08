package app.gagachat.feature.chat.presentation

/**
 * Local-only context detector for the GaGa Action Bar.
 *
 * It never performs an action, mutates a message, or sends message text to a
 * network service. It only ranks actions that already exist in the client.
 */
enum class SmartActionKind { EVENT, REMINDER, EXPENSE, TASK, POLL }

data class SmartActionSuggestion(
    val kind: SmartActionKind,
    val label: String,
)

object SmartActionDetector {
    private val money = Regex(
        """(?i)(?:৳|bdt|tk\.?|taka|টাকা|usd|\$|cny|rmb|¥|元|人民币)\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?|[0-9][0-9,]*(?:\.[0-9]{1,2})?\s*(?:bdt|tk\.?|taka|টাকা|usd|cny|rmb|元|人民币)"""
    )
    private val explicitTime = Regex("""(?i)\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)?\b""")
    private val dateLanguage = Regex(
        """(?i)(?:\b(?:today|tomorrow|tonight|this morning|this afternoon|this evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|আজ|আগামীকাল|কাল|সোমবার|মঙ্গলবার|বুধবার|বৃহস্পতিবার|শুক্রবার|শনিবার|রবিবার|今天|明天|今晚|星期一|星期二|星期三|星期四|星期五|星期六|星期日)"""
    )
    private val taskLanguage = Regex(
        """(?i)(?:\b(?:please|need to|must|remember to|don't forget|send|submit|buy|bring|call|finish|complete)\b|দয়া করে|করতে হবে|মনে রাখ|পাঠাও|জমা দাও|কিনে|ফোন কর|请|需要|记得|发送|提交|购买|打电话)"""
    )

    fun detect(text: String?, isGroup: Boolean): List<SmartActionSuggestion> {
        val raw = text.orEmpty().trim()
        if (raw.isBlank()) return emptyList()

        val suggestions = linkedMapOf<SmartActionKind, SmartActionSuggestion>()

        val hasMoney = money.containsMatchIn(raw)
        val hasDateOrTime = dateLanguage.containsMatchIn(raw) || explicitTime.containsMatchIn(raw)
        val looksLikeQuestion = raw.endsWith("?") || raw.endsWith("？")

        if (hasDateOrTime) {
            suggestions[SmartActionKind.EVENT] = SmartActionSuggestion(
                SmartActionKind.EVENT,
                "Create event",
            )
            suggestions[SmartActionKind.REMINDER] = SmartActionSuggestion(
                SmartActionKind.REMINDER,
                "Remind me",
            )
        }
        if (hasMoney) {
            suggestions[SmartActionKind.EXPENSE] = SmartActionSuggestion(
                SmartActionKind.EXPENSE,
                "Record expense",
            )
        }
        if (isGroup && looksLikeQuestion) {
            suggestions[SmartActionKind.POLL] = SmartActionSuggestion(
                SmartActionKind.POLL,
                "Turn into poll",
            )
        }
        if (taskLanguage.containsMatchIn(raw) || (!hasMoney && !hasDateOrTime && raw.length >= 18)) {
            suggestions[SmartActionKind.TASK] = SmartActionSuggestion(
                SmartActionKind.TASK,
                "Create task",
            )
        }

        return suggestions.values.take(3)
    }
}
