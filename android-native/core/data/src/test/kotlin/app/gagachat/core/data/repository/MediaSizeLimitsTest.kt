package app.gagachat.core.data.repository

import app.gagachat.core.common.Constants
import app.gagachat.core.model.MessageType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * V3.0 Sprint B (checklist row #6): locks in the per-type upload caps so a future
 * refactor cannot silently collapse audio/documents back onto the global ceiling.
 */
class MediaSizeLimitsTest {

    @Test
    fun eachMediaKindHasItsOwnCap() {
        assertEquals(Constants.MAX_IMAGE_UPLOAD_BYTES, mediaUploadLimit(MessageType.IMAGE))
        assertEquals(Constants.MAX_VIDEO_UPLOAD_BYTES, mediaUploadLimit(MessageType.VIDEO))
        assertEquals(Constants.MAX_AUDIO_UPLOAD_BYTES, mediaUploadLimit(MessageType.AUDIO))
        assertEquals(Constants.MAX_DOCUMENT_UPLOAD_BYTES, mediaUploadLimit(MessageType.FILE))
    }

    @Test
    fun audioAndDocumentsNoLongerShareTheGlobalCeiling() {
        // Regression: both previously inherited the 100 MB global cap, so an
        // oversized file was queued and only failed after a long upload.
        assertTrue(mediaUploadLimit(MessageType.AUDIO) < Constants.MAX_UPLOAD_BYTES)
        assertTrue(mediaUploadLimit(MessageType.FILE) < Constants.MAX_UPLOAD_BYTES)
    }

    @Test
    fun nonMediaTypesFallBackToTheGlobalCeiling() {
        assertEquals(Constants.MAX_UPLOAD_BYTES, mediaUploadLimit(MessageType.TEXT))
        assertEquals(Constants.MAX_UPLOAD_BYTES, mediaUploadLimit(MessageType.LOCATION))
        assertEquals(Constants.MAX_UPLOAD_BYTES, mediaUploadLimit(MessageType.CONTACT))
    }

    @Test
    fun labelsAndMegabytesAreConsistentWithTheCap() {
        assertEquals("photo", mediaKindLabel(MessageType.IMAGE))
        assertEquals("video", mediaKindLabel(MessageType.VIDEO))
        assertEquals("audio file", mediaKindLabel(MessageType.AUDIO))
        assertEquals("document", mediaKindLabel(MessageType.FILE))
        assertEquals(
            Constants.MAX_DOCUMENT_UPLOAD_BYTES / (1024 * 1024),
            mediaUploadLimitMb(MessageType.FILE),
        )
    }
}
