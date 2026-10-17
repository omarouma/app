package app.gagachat.core.model

/**
 * A private, owner-scoped saved place surfaced in the location picker.
 * Favourites are local-only and belong to the signed-in account; they are
 * never shared with a chat recipient and are not synced to other devices.
 */
data class SavedPlace(
    val id: String,
    val label: String,
    val detail: String,
    val latitude: Double,
    val longitude: Double,
    val createdAt: Long,
) {
    /** Human-readable coordinate line used as a fallback when [detail] is blank. */
    val coordinateLabel: String
        get() = "%.5f, %.5f".format(latitude, longitude)
}
