package app.gagachat.core.model

/**
 * GaGa Language Bridge (Signature Features 2.4).
 *
 * Translation is a *read-only* helper: it never mutates the original message and
 * never auto-sends anything. The original text always stays available next to
 * the translation so the reader can compare. Because the text leaves the device
 * for cloud processing, every translation result carries the [provider] that
 * produced it and the UI must disclose that the message was sent to a
 * third-party translation service before the user confirms.
 */
data class TranslateResult(
    val translated: String,
    val sourceLang: String?,
    val targetLang: String,
    val provider: String,
)

/** A language the Language Bridge can translate to/from. */
data class TranslateLanguage(val code: String, val label: String) {
    companion object {
        /** A small, deliberately curated set so the picker stays usable. */
        val SUPPORTED: List<TranslateLanguage> = listOf(
            TranslateLanguage("auto", "Detect language"),
            TranslateLanguage("en", "English"),
            TranslateLanguage("bn", "বাংলা (Bengali)"),
            TranslateLanguage("zh", "中文 (Chinese)"),
            TranslateLanguage("hi", "हिन्दी (Hindi)"),
            TranslateLanguage("ar", "العربية (Arabic)"),
            TranslateLanguage("es", "Español (Spanish)"),
            TranslateLanguage("fr", "Français (French)"),
            TranslateLanguage("de", "Deutsch (German)"),
            TranslateLanguage("pt", "Português (Portuguese)"),
            TranslateLanguage("ru", "Русский (Russian)"),
            TranslateLanguage("ja", "日本語 (Japanese)"),
            TranslateLanguage("ko", "한국어 (Korean)"),
            TranslateLanguage("id", "Bahasa Indonesia"),
            TranslateLanguage("tr", "Türkçe (Turkish)"),
            TranslateLanguage("ur", "اردو (Urdu)"),
        )

        fun labelFor(code: String?): String =
            SUPPORTED.firstOrNull { it.code.equals(code, ignoreCase = true) }?.label ?: (code ?: "Unknown")
    }
}
