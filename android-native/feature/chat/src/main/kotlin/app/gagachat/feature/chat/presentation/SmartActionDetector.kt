package app.gagachat.feature.chat.presentation

enum class SmartActionKind { EVENT, REMINDER, EXPENSE, SPLIT_BILL, LOCATION, TASK, POLL }

data class SmartActionSuggestion(val kind: SmartActionKind, val label: String)

data class DetectedMoney(val amountText: String, val currency: String)

object SmartActionDetector {
    private val money = Regex(
        """(?i)(৳|bdt|tk\.?|taka|টাকা|usd|\$|cny|rmb|¥|元|人民币)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(bdt|tk\.?|taka|টাকা|usd|cny|rmb|元|人民币)"""
    )
    private val explicitTime = Regex("""(?i)\b(?:(?:[01]?\d|2[0-3]):[0-5]\d\s*(?:am|pm)?|(?:0?[1-9]|1[0-2])\s*(?:am|pm))\b""")
    private val dateLanguage = Regex(
        """(?i)(?:\b(?:today|tomorrow|tonight|this morning|this afternoon|this evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|আজ|আগামীকাল|কাল|সোমবার|মঙ্গলবার|বুধবার|বৃহস্পতিবার|শুক্রবার|শনিবার|রবিবার|今天|明天|今晚|星期一|星期二|星期三|星期四|星期五|星期六|星期日)"""
    )
    private val taskLanguage = Regex(
        """(?i)(?:\b(?:please|need to|must|remember to|don't forget|send|submit|buy|bring|call|finish|complete)\b|দয়া করে|করতে হবে|মনে রাখ|পাঠাও|জমা দাও|কিনে|ফোন কর|请|需要|记得|发送|提交|购买|打电话)"""
    )
    private val mapLink = Regex("""(?i)https?://(?:www\.)?(?:maps\.google\.[^/]+|google\.[^/]+/maps|maps\.app\.goo\.gl)/\S+""")
    private val coordinatePair = Regex("""(?<!\d)(-?(?:[0-8]?\d(?:\.\d+)?|90(?:\.0+)?))\s*,\s*(-?(?:1[0-7]\d(?:\.\d+)?|[0-9]?\d(?:\.\d+)?|180(?:\.0+)?))(?!\d)""")

    fun money(text: String?): DetectedMoney? {
        val match = money.find(text.orEmpty()) ?: return null
        val token = (match.groups[1]?.value ?: match.groups[4]?.value).orEmpty().lowercase()
        val amount = (match.groups[2]?.value ?: match.groups[3]?.value)?.replace(",", "") ?: return null
        val currency = when {
            token in listOf("$", "usd") -> "USD"
            token in listOf("¥", "cny", "rmb", "元", "人民币") -> "CNY"
            else -> "BDT"
        }
        return DetectedMoney(amount, currency)
    }

    fun hasLocation(text: String?): Boolean {
        val raw = text.orEmpty()
        return mapLink.containsMatchIn(raw) || coordinatePair.containsMatchIn(raw)
    }

    fun detect(text: String?, isGroup: Boolean): List<SmartActionSuggestion> {
        val raw = text.orEmpty().trim()
        if (raw.isBlank()) return emptyList()
        val suggestions = linkedMapOf<SmartActionKind, SmartActionSuggestion>()
        val detectedMoney = money(raw)
        val hasDateOrTime = dateLanguage.containsMatchIn(raw) || explicitTime.containsMatchIn(raw)
        val looksLikeQuestion = raw.endsWith("?") || raw.endsWith("？")

        if (hasDateOrTime) {
            suggestions[SmartActionKind.EVENT] = SmartActionSuggestion(SmartActionKind.EVENT, "Create event")
            suggestions[SmartActionKind.REMINDER] = SmartActionSuggestion(SmartActionKind.REMINDER, "Remind me")
        }
        if (detectedMoney != null) {
            suggestions[SmartActionKind.SPLIT_BILL] = SmartActionSuggestion(SmartActionKind.SPLIT_BILL, "Split bill")
            suggestions[SmartActionKind.EXPENSE] = SmartActionSuggestion(SmartActionKind.EXPENSE, "Record expense")
        }
        if (hasLocation(raw)) suggestions[SmartActionKind.LOCATION] = SmartActionSuggestion(SmartActionKind.LOCATION, "Open location")
        if (isGroup && looksLikeQuestion) suggestions[SmartActionKind.POLL] = SmartActionSuggestion(SmartActionKind.POLL, "Turn into poll")
        if (taskLanguage.containsMatchIn(raw) || (detectedMoney == null && !hasDateOrTime && raw.length >= 18)) {
            suggestions[SmartActionKind.TASK] = SmartActionSuggestion(SmartActionKind.TASK, "Create task")
        }
        return suggestions.values.take(4)
    }
}
