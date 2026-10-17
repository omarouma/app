package app.gagachat.feature.chat.presentation.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhotoAnnotationsTest {
    private val red = PhotoDoodlePalette.first()

    private fun stroke(vararg points: Pair<Float, Float>) =
        DoodleStroke(points.map { NormPoint(it.first, it.second) }, red, 0.012f)

    @Test fun emptyLayerReportsEmptyAndSinglePointStrokeIsNotDrawable() {
        assertTrue(PhotoAnnotations().isEmpty)
        assertFalse(stroke(0.1f to 0.1f).isDrawable)
        assertTrue(stroke(0.1f to 0.1f, 0.2f to 0.2f).isDrawable)
    }

    @Test fun addingStrokesAndStickersAccumulatesWithoutMutatingOriginal() {
        val base = PhotoAnnotations()
        val withStroke = base.withStroke(stroke(0f to 0f, 1f to 1f))
        val withSticker = withStroke.withSticker(StickerPlacement("\u2b50", NormPoint(0.5f, 0.5f), 0.2f))
        assertTrue(base.isEmpty)
        assertEquals(1, withStroke.strokes.size)
        assertEquals(1, withSticker.strokes.size)
        assertEquals(1, withSticker.stickers.size)
    }

    @Test fun moveLastStickerRepositionsOnlyTheNewestAndClampsToImage() {
        val layer = PhotoAnnotations()
            .withSticker(StickerPlacement("\u2b50", NormPoint(0.2f, 0.2f), 0.2f))
            .withSticker(StickerPlacement("\ud83c\udf89", NormPoint(0.3f, 0.3f), 0.2f))
        val moved = layer.moveLastSticker(NormPoint(1.4f, -0.5f))
        assertEquals(NormPoint(0.2f, 0.2f), moved.stickers.first().anchor)
        assertEquals(NormPoint(1f, 0f), moved.stickers.last().anchor)
        assertEquals(layer, PhotoAnnotations().withSticker(layer.stickers.first())
            .withSticker(layer.stickers.last()))
    }

    @Test fun moveLastStickerOnEmptyLayerIsNoOp() {
        val empty = PhotoAnnotations()
        assertEquals(empty, empty.moveLastSticker(NormPoint(0.5f, 0.5f)))
    }

    @Test fun undoRedoAndNewChangeDropsRedo() {
        val a = PhotoAnnotations().withStroke(stroke(0f to 0f, 0.5f to 0.5f))
        val b = a.withSticker(StickerPlacement("\u2b50", NormPoint(0.5f, 0.5f), 0.2f))
        val history = AnnotationHistory().change(a).change(b)
        assertEquals(a, history.undo().current)
        assertEquals(PhotoAnnotations(), history.undo().undo().current)
        assertEquals(b, history.undo().undo().redo().redo().current)
        assertTrue(history.undo().change(a.copy(strokes = emptyList())).future.isEmpty())
    }

    @Test fun noOpChangeDoesNotGrowHistoryOrDropRedo() {
        val a = PhotoAnnotations().withStroke(stroke(0f to 0f, 1f to 1f))
        val undone = AnnotationHistory().change(a).undo()
        assertEquals(undone, undone.change(undone.current))
        assertTrue(undone.canRedo)
    }

    @Test fun clearIsUndoable() {
        val a = PhotoAnnotations().withStroke(stroke(0f to 0f, 1f to 1f))
        val cleared = AnnotationHistory().change(a).change(PhotoAnnotations())
        assertTrue(cleared.current.isEmpty)
        assertEquals(a, cleared.undo().current)
    }

    @Test fun historyIsBounded() {
        var history = AnnotationHistory()
        repeat(120) { history = history.change(PhotoAnnotations().withStroke(stroke(0f to 0f, it / 120f to 1f))) }
        assertEquals(AnnotationHistory.MAX_HISTORY, history.past.size)
    }

    @Test fun normalizePointerMapsAndClampsToUnitSpace() {
        assertEquals(NormPoint(0.5f, 0.25f), normalizePointer(50f, 25f, 100, 100))
        assertEquals(NormPoint(1f, 1f), normalizePointer(200f, 200f, 100, 100))
        assertEquals(NormPoint(0f, 0f), normalizePointer(-5f, -5f, 100, 100))
        assertEquals(NormPoint(0f, 0f), normalizePointer(10f, 10f, 0, 0))
    }

    @Test fun strokeAndStickerSizesScaleWithShorterEdgeAndNeverZero() {
        assertEquals(12f, strokeWidthPx(0.012f, 1000, 4000), 0.001f)
        assertEquals(200f, stickerSizePx(0.2f, 4000, 1000), 0.001f)
        assertEquals(1f, strokeWidthPx(0f, 1000, 1000), 0.001f)
        assertEquals(1f, stickerSizePx(0f, 0, 0), 0.001f)
    }
}
