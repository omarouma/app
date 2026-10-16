package app.gagachat.feature.profile.presentation

import org.junit.Assert.*
import org.junit.Test

class CoverCropScaleTest {
    private fun verify(vw: Float, vh: Float) {
        val (x, y) = coverCropScale(320f, 128f, vw, vh)
        assertTrue(x >= 1f && y >= 1f)
        assertEquals("TextureView must preserve video pixel aspect ratio", 320f / vw * x, 128f / vh * y, 0.0001f)
        assertEquals("At least one video dimension should exactly fill the frame", 1f, minOf(x, y), 0.0001f)
    }
    @Test fun landscapeVideoPreservesAspect() = verify(1920f, 1080f)
    @Test fun portraitVideoPreservesAspect() = verify(1080f, 1920f)
}
