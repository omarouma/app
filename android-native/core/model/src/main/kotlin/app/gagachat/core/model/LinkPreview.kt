package app.gagachat.core.model

/**
 * Rich preview metadata for a URL shared inside a text message (spec area 13).
 *
 * Only the fields needed to render a compact card are kept; the full HTML is
 * never persisted. [imageUrl] points at the remote OpenGraph image which the UI
 * loads through the normal Coil pipeline.
 */
data class LinkPreview(
    val url: String,
    val title: String? = null,
    val description: String? = null,
    val imageUrl: String? = null,
    val siteName: String? = null,
) {
    /** True when there is at least one piece of renderable metadata. */
    val hasContent: Boolean
        get() = !title.isNullOrBlank() ||
            !description.isNullOrBlank() ||
            !imageUrl.isNullOrBlank() ||
            !siteName.isNullOrBlank()

    /** Host shown as the card's fallback label (e.g. "youtube.com"). */
    val displayHost: String
        get() = runCatching {
            val host = java.net.URI(url).host ?: url
            host.removePrefix("www.")
        }.getOrDefault(url)
}
