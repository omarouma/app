package app.gagachat.core.model

/** Device-local spacing preference; never changes Android's display density. */
enum class LayoutSize(val label: String, val headerDp: Int, val searchDp: Int, val navigationDp: Int) {
    COMPACT("Compact", 48, 40, 56),
    STANDARD("Standard", 56, 44, 64),
    ROOMY("Roomy", 64, 48, 80),
}
