package app.gagachat.feature.chat.presentation.components

/** Edits refer to the original source; exporting never overwrites it. */
internal data class VideoEdits(
    val startMs: Long = 0L,
    val endMs: Long,
    val muted: Boolean = false,
    val text: String = "",
    val sticker: String = "",
    val textPosition: VideoOverlayPosition = VideoOverlayPosition.BOTTOM,
) {
    fun isOriginal(durationMs: Long) = startMs == 0L && endMs == durationMs &&
        !muted && text.isBlank() && sticker.isBlank()
    fun isValid(durationMs: Long) = startMs >= 0 && endMs <= durationMs &&
        endMs > startMs && (endMs - startMs >= minOf(1000L, durationMs))
}

internal enum class VideoOverlayPosition(val label: String, val anchorY: Float) {
    TOP("Top", 0.7f), CENTER("Center", 0f), BOTTOM("Bottom", -0.7f)
}

/** Bounded immutable history. A new change after undo discards the redo branch. */
internal data class VideoEditHistory(
    val current: VideoEdits,
    val past: List<VideoEdits> = emptyList(),
    val future: List<VideoEdits> = emptyList(),
) {
    fun change(next: VideoEdits): VideoEditHistory = if (next == current) this else
        VideoEditHistory(next, (past + current).takeLast(50))
    fun undo(): VideoEditHistory = if (past.isEmpty()) this else
        VideoEditHistory(past.last(), past.dropLast(1), listOf(current) + future)
    fun redo(): VideoEditHistory = if (future.isEmpty()) this else
        VideoEditHistory(future.first(), (past + current).takeLast(50), future.drop(1))
}
