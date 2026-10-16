package app.gagachat.feature.chat.presentation.components

internal data class PhotoPoint(val x: Float, val y: Float)
internal data class PhotoStroke(val points: List<PhotoPoint>, val color: Int, val mosaic: Boolean = false)
internal data class PhotoEdits(
    val rotation: Int = 0, val flipped: Boolean = false, val crop: PhotoCrop = PhotoCrop.ORIGINAL,
    val text: String = "", val sticker: String = "", val strokes: List<PhotoStroke> = emptyList(),
)
internal data class PhotoEditHistory(
    val current: PhotoEdits = PhotoEdits(), val past: List<PhotoEdits> = emptyList(), val future: List<PhotoEdits> = emptyList(),
) {
    fun change(next: PhotoEdits) = if (next == current) this else PhotoEditHistory(next, (past + current).takeLast(40))
    fun undo() = if (past.isEmpty()) this else PhotoEditHistory(past.last(), past.dropLast(1), listOf(current) + future)
    fun redo() = if (future.isEmpty()) this else PhotoEditHistory(future.first(), (past + current).takeLast(40), future.drop(1))
}
