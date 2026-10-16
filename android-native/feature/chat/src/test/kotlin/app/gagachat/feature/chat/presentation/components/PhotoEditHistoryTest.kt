package app.gagachat.feature.chat.presentation.components

import org.junit.Assert.*
import org.junit.Test

class PhotoEditHistoryTest {
    @Test fun undoRedoRestoresDrawingAndCropTogether() {
        val drawn = PhotoEdits(strokes = listOf(PhotoStroke(listOf(PhotoPoint(0.2f, 0.2f), PhotoPoint(0.8f, 0.8f)), 0)))
        val cropped = drawn.copy(crop = PhotoCrop.SQUARE, sticker = "⭐")
        val history = PhotoEditHistory().change(drawn).change(cropped)
        assertEquals(drawn, history.undo().current)
        assertEquals(cropped, history.undo().redo().current)
        assertTrue(history.undo().change(drawn.copy(text = "New")).future.isEmpty())
        assertEquals(cropped, history.change(PhotoEdits()).undo().current)
    }
}
