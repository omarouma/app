package app.gagachat.feature.chat.presentation.components

import android.graphics.Canvas as AndroidCanvas
import android.graphics.Bitmap
import android.graphics.Rect
import android.graphics.Paint
import android.graphics.Path

/**
 * Doodle and sticker annotations for the on-device photo editor.
 *
 * Everything is stored in normalized (0..1) image coordinates so a single
 * annotation layer renders identically in the small review preview and in the
 * full-resolution export. The original photo is never mutated; annotations are
 * composited onto a throwaway copy right before upload.
 */
internal data class NormPoint(val x: Float, val y: Float) {
    fun clamped(): NormPoint = NormPoint(x.coerceIn(0f, 1f), y.coerceIn(0f, 1f))
}

/** A freehand doodle stroke. [widthFraction] is relative to the shorter image edge. */
internal data class DoodleStroke(
    val points: List<NormPoint>,
    val colorArgb: Int,
    val widthFraction: Float,
    val mosaic: Boolean = false,
) {
    val isDrawable: Boolean get() = points.size >= 2
}

/** A sticker anchored at a normalized point. [scaleFraction] is relative to the shorter edge. */
internal data class StickerPlacement(
    val emoji: String,
    val anchor: NormPoint,
    val scaleFraction: Float,
)

/** Immutable annotation layer drawn over a photo. */
internal data class PhotoAnnotations(
    val strokes: List<DoodleStroke> = emptyList(),
    val stickers: List<StickerPlacement> = emptyList(),
) {
    val isEmpty: Boolean get() = strokes.isEmpty() && stickers.isEmpty()

    fun withStroke(stroke: DoodleStroke): PhotoAnnotations = copy(strokes = strokes + stroke)

    fun withSticker(sticker: StickerPlacement): PhotoAnnotations = copy(stickers = stickers + sticker)

    /** Repositions the most recently added sticker (used while dragging). */
    fun moveLastSticker(anchor: NormPoint): PhotoAnnotations =
        if (stickers.isEmpty()) this
        else copy(stickers = stickers.dropLast(1) + stickers.last().copy(anchor = anchor.clamped()))
}

/**
 * Bounded undo/redo history for annotation edits. Mirrors [VideoEditHistory] so
 * the two editors behave the same way and never grow without limit.
 */
internal data class AnnotationHistory(
    val past: List<PhotoAnnotations> = emptyList(),
    val current: PhotoAnnotations = PhotoAnnotations(),
    val future: List<PhotoAnnotations> = emptyList(),
) {
    val canUndo: Boolean get() = past.isNotEmpty()
    val canRedo: Boolean get() = future.isNotEmpty()

    fun change(next: PhotoAnnotations): AnnotationHistory {
        if (next == current) return this
        val trimmed = (past + current).takeLast(MAX_HISTORY)
        return AnnotationHistory(trimmed, next, emptyList())
    }

    fun undo(): AnnotationHistory =
        if (past.isEmpty()) this
        else AnnotationHistory(past.dropLast(1), past.last(), listOf(current) + future)

    fun redo(): AnnotationHistory =
        if (future.isEmpty()) this
        else AnnotationHistory(past + current, future.first(), future.drop(1))

    companion object {
        const val MAX_HISTORY = 50
    }
}

/** Maps a pointer position in a [width]x[height] view to normalized image space. */
internal fun normalizePointer(xPx: Float, yPx: Float, width: Int, height: Int): NormPoint {
    if (width <= 0 || height <= 0) return NormPoint(0f, 0f)
    return NormPoint((xPx / width).coerceIn(0f, 1f), (yPx / height).coerceIn(0f, 1f))
}

/** Doodle stroke width in pixels for a normalized fraction against the shorter edge. */
internal fun strokeWidthPx(widthFraction: Float, imageWidth: Int, imageHeight: Int): Float =
    (widthFraction * minOf(imageWidth, imageHeight)).coerceAtLeast(1f)

/** Sticker glyph size in pixels for a normalized fraction against the shorter edge. */
internal fun stickerSizePx(scaleFraction: Float, imageWidth: Int, imageHeight: Int): Float =
    (scaleFraction * minOf(imageWidth, imageHeight)).coerceAtLeast(1f)

/**
 * Draws the annotation layer onto [canvas] in pixel space. Used by the export
 * path so the sent image matches exactly what the sender previewed.
 */
internal fun renderAnnotations(
    canvas: AndroidCanvas,
    imageWidth: Int,
    imageHeight: Int,
    annotations: PhotoAnnotations,
    bitmap: Bitmap? = null,
) {
    if (annotations.isEmpty || imageWidth <= 0 || imageHeight <= 0) return
    annotations.strokes.forEach { stroke ->
        if (!stroke.isDrawable) return@forEach
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = stroke.colorArgb
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            strokeWidth = strokeWidthPx(stroke.widthFraction, imageWidth, imageHeight)
        }
        val path = Path()
        stroke.points.forEachIndexed { index, point ->
            val px = point.x * imageWidth
            val py = point.y * imageHeight
            if (index == 0) path.moveTo(px, py) else path.lineTo(px, py)
        }
        if (stroke.mosaic && bitmap != null) {
            val small = Bitmap.createScaledBitmap(bitmap, maxOf(1, imageWidth / 24), maxOf(1, imageHeight / 24), false)
            val clip = Path()
            paint.getFillPath(path, clip)
            val save = canvas.save()
            try {
                canvas.clipPath(clip)
                canvas.drawBitmap(small, null, Rect(0, 0, imageWidth, imageHeight), Paint().apply { isFilterBitmap = false })
            } finally {
                canvas.restoreToCount(save)
                if (small !== bitmap) small.recycle()
            }
        } else {
            if (stroke.mosaic) paint.color = android.graphics.Color.GRAY
            canvas.drawPath(path, paint)
        }
    }
    annotations.stickers.forEach { sticker ->
        if (sticker.emoji.isBlank()) return@forEach
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = stickerSizePx(sticker.scaleFraction, imageWidth, imageHeight)
            textAlign = Paint.Align.CENTER
        }
        canvas.drawText(sticker.emoji, sticker.anchor.x * imageWidth, sticker.anchor.y * imageHeight, paint)
    }
}

/** Sticker palette shared by the editor UI. */
internal val PhotoStickerPalette: List<String> = listOf("\u2764\ufe0f", "\u2b50", "\ud83c\udf89", "\ud83d\ude0a", "\ud83d\udc4d", "\ud83d\udd25", "\ud83d\udcaf", "\u2705")

/** Doodle colour palette (ARGB) shared by the editor UI. */
internal val PhotoDoodlePalette: List<Int> = listOf(
    0xFFFF3B30.toInt(), // red
    0xFFFFCC00.toInt(), // yellow
    0xFF34C759.toInt(), // green
    0xFF0A84FF.toInt(), // blue
    0xFFFFFFFF.toInt(), // white
    0xFF111111.toInt(), // near-black
)
