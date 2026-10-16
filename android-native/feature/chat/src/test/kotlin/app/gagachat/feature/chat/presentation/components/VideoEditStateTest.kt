package app.gagachat.feature.chat.presentation.components

import org.junit.Assert.*
import org.junit.Test

class VideoEditStateTest {
    private val original = VideoEdits(endMs = 10_000)

    @Test fun undoRedoRestoresCombinedEditsAndNewChangeDropsRedo() {
        val trimmed = original.copy(startMs = 2000, endMs = 8000)
        val decorated = trimmed.copy(muted = true, text = "Hello", sticker = "⭐")
        val history = VideoEditHistory(original).change(trimmed).change(decorated)
        assertEquals(trimmed, history.undo().current)
        assertEquals(original, history.undo().undo().current)
        assertEquals(decorated, history.undo().undo().redo().redo().current)
        assertTrue(history.undo().change(trimmed.copy(text = "New")).future.isEmpty())
    }

    @Test fun restoreOriginalIsUndoableAndNoOpDoesNotLoseRedo() {
        val changed = original.copy(muted = true)
        val restored = VideoEditHistory(original).change(changed).change(original)
        assertTrue(restored.current.isOriginal(10_000))
        assertEquals(changed, restored.undo().current)
        val undone = restored.undo()
        assertEquals(undone, undone.change(undone.current))
    }

    @Test fun historyIsBounded() {
        var history = VideoEditHistory(original)
        repeat(100) { history = history.change(original.copy(text = "$it")) }
        assertEquals(50, history.past.size)
    }

    @Test fun validatesRangesIncludingShortOriginalVideos() {
        assertTrue(original.isValid(10_000))
        assertFalse(original.copy(startMs = -1).isValid(10_000))
        assertFalse(original.copy(endMs = 10_001).isValid(10_000))
        assertFalse(original.copy(startMs = 9500).isValid(10_000))
        assertFalse(VideoEdits(endMs = 0).isValid(0))
        assertTrue(VideoEdits(endMs = 500).isValid(500))
    }
}
