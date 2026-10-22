package app.gagachat.core.common.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression tests for storage object-path extensions.
 *
 * The bug being guarded against: `mime.substringAfterLast('/')` produced
 * `jpeg`, `quicktime`, `mpeg`, and -- for Office documents -- a 60 character
 * pseudo-extension that corrupted the object path.
 */
class MediaFileTypesTest {

    @Test
    fun `jpeg maps to jpg not jpeg`() {
        assertEquals("jpg", MediaFileTypes.extensionForMime("image/jpeg"))
    }

    @Test
    fun `quicktime maps to mov not quicktime`() {
        assertEquals("mov", MediaFileTypes.extensionForMime("video/quicktime"))
    }

    @Test
    fun `audio mpeg maps to mp3 not mpeg`() {
        assertEquals("mp3", MediaFileTypes.extensionForMime("audio/mpeg"))
    }

    @Test
    fun `matroska maps to mkv`() {
        assertEquals("mkv", MediaFileTypes.extensionForMime("video/x-matroska"))
    }

    @Test
    fun `office word document maps to docx`() {
        val mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        assertEquals("docx", MediaFileTypes.extensionForMime(mime))
    }

    @Test
    fun `office spreadsheet maps to xlsx`() {
        val mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assertEquals("xlsx", MediaFileTypes.extensionForMime(mime))
    }

    @Test
    fun `office presentation maps to pptx`() {
        val mime = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        assertEquals("pptx", MediaFileTypes.extensionForMime(mime))
    }

    @Test
    fun `extension is never longer than eight characters`() {
        val hostile = listOf(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.oasis.opendocument.spreadsheet",
            "application/x-something-very-long-indeed",
            "application/vnd.some.vendor.format.that.is.long",
        )
        hostile.forEach { mime ->
            val ext = MediaFileTypes.extensionForMime(mime)
            assertTrue("$mime produced '$ext'", ext.length <= 8)
            assertTrue("$mime produced '$ext'", ext.all { it.isLetterOrDigit() })
        }
    }

    @Test
    fun `mime parameters are stripped`() {
        assertEquals("jpg", MediaFileTypes.extensionForMime("image/jpeg; charset=binary"))
    }

    @Test
    fun `uppercase mime is normalised`() {
        assertEquals("png", MediaFileTypes.extensionForMime("IMAGE/PNG"))
    }

    @Test
    fun `octet stream falls back to bin`() {
        assertEquals("bin", MediaFileTypes.extensionForMime("application/octet-stream"))
    }

    @Test
    fun `unknown mime with no table entry uses the file name`() {
        val ext = MediaFileTypes.extensionForMime(
            mime = "application/x-made-up",
            fileName = "notes.md",
        )
        assertEquals("md", ext)
    }

    @Test
    fun `null mime uses the file name`() {
        assertEquals("pdf", MediaFileTypes.extensionForMime(null, "invoice.pdf"))
    }

    @Test
    fun `table entry wins over a misleading file name`() {
        // The MIME is authoritative when we know it; a renamed file must not
        // change how the object is stored.
        assertEquals("jpg", MediaFileTypes.extensionForMime("image/jpeg", "photo.png"))
        assertEquals("mov", MediaFileTypes.extensionForMime("video/quicktime", "clip.mp4"))
    }

    @Test
    fun `subtype is derived when the name has no usable suffix`() {
        assertEquals("icon", MediaFileTypes.extensionForMime("image/x-icon", "favicon"))
        assertEquals("vcard", MediaFileTypes.extensionForMime("text/x-vcard", null))
    }

    @Test
    fun `nothing usable falls back to bin`() {
        assertEquals("bin", MediaFileTypes.extensionForMime(null, null))
        assertEquals("bin", MediaFileTypes.extensionForMime("", ""))
    }

    @Test
    fun `svg plus suffix resolves to svg`() {
        assertEquals("svg", MediaFileTypes.extensionForMime("image/svg+xml"))
    }

    @Test
    fun `x prefixed subtype is unwrapped`() {
        assertEquals("icon", MediaFileTypes.extensionForMime("image/x-icon"))
    }

    @Test
    fun `mimeForFileName round trips common types`() {
        assertEquals("image/jpeg", MediaFileTypes.mimeForFileName("IMG_0001.JPG"))
        assertEquals("video/mp4", MediaFileTypes.mimeForFileName("clip.mp4"))
        assertEquals("audio/mpeg", MediaFileTypes.mimeForFileName("note.mp3"))
        assertEquals("application/pdf", MediaFileTypes.mimeForFileName("a.pdf"))
    }

    @Test
    fun `mimeForFileName falls back for unknown extensions`() {
        assertEquals(MediaFileTypes.FALLBACK_MIME, MediaFileTypes.mimeForFileName("weird.qqq"))
        assertEquals(MediaFileTypes.FALLBACK_MIME, MediaFileTypes.mimeForFileName(null))
    }

    @Test
    fun `type predicates`() {
        assertTrue(MediaFileTypes.isImage("image/webp"))
        assertTrue(MediaFileTypes.isVideo("video/mp4"))
        assertTrue(MediaFileTypes.isAudio("audio/ogg"))
        assertFalse(MediaFileTypes.isImage("video/mp4"))
        assertFalse(MediaFileTypes.isVideo("image/png"))
        assertFalse(MediaFileTypes.isAudio("application/pdf"))
    }

    @Test
    fun `extension for mime is stable across the whole table`() {
        // Every mapped value must itself be a legal extension, otherwise the
        // table would reintroduce the bug it exists to prevent.
        listOf(
            "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic",
            "video/mp4", "video/quicktime", "video/3gpp", "video/webm", "video/x-matroska",
            "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/ogg", "audio/amr",
            "application/pdf", "text/plain", "application/zip",
        ).forEach { mime ->
            val ext = MediaFileTypes.extensionForMime(mime)
            assertTrue("$mime -> '$ext'", ext.length in 1..8)
            assertTrue("$mime -> '$ext'", ext.all { it.isLetterOrDigit() })
        }
    }
}
