package app.gagachat.feature.chat.presentation.components

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VideoMuteTrackTest {
    @Test fun normalExportPreservesVideoAndAudio() {
        assertTrue(muxTrackIncluded("video/avc", false))
        assertTrue(muxTrackIncluded("audio/mp4a-latm", false))
        assertFalse(muxTrackIncluded("application/id3", false))
    }

    @Test fun muteExportRemovesAudioWithoutRemovingVideo() {
        assertTrue(muxTrackIncluded("video/hevc", true))
        assertFalse(muxTrackIncluded("audio/mp4a-latm", true))
        assertFalse(muxTrackIncluded("audio/opus", true))
        assertFalse(muxTrackIncluded("text/vtt", true))
    }
}
