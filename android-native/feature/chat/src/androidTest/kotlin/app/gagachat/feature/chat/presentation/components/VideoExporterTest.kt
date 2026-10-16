package app.gagachat.feature.chat.presentation.components

import android.graphics.Color
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

/** Real codec/export tests against a generated blue video with an audible tone. */
class VideoExporterTest {
    @Test fun trimMuteAndOverlaysProduceDecodableCopyWithoutChangingSource() = runBlocking {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val source = File(context.cacheDir, "video-editor-source.mp4")
        instrumentation.context.assets.open("video-editor-source.mp4").use { input ->
            source.outputStream().use { input.copyTo(it) }
        }
        val before = MessageDigest.getInstance("SHA-256").digest(source.readBytes())
        val edits = VideoEdits(startMs = 500, endMs = 2500, muted = true,
            text = "GaGa", sticker = "⭐", textPosition = VideoOverlayPosition.CENTER)
        var output: File? = null
        try {
            output = exportVideo(context, Uri.fromFile(source), edits)
            assertNotEquals(source.absolutePath, output.absolutePath)
            verifyVideoExport(context, output, edits)
            assertArrayEquals(before, MessageDigest.getInstance("SHA-256").digest(source.readBytes()))
            val reader = MediaMetadataRetriever()
            try {
                reader.setDataSource(output.absolutePath)
                val frame = requireNotNull(reader.getFrameAtTime(500_000))
                // Source is solid blue. White/yellow pixels prove overlays reached the encoded file.
                var overlayPixels = 0
                for (y in 0 until frame.height) for (x in 0 until frame.width) {
                    val pixel = frame.getPixel(x, y)
                    if (Color.red(pixel) > 160 && Color.green(pixel) > 160) overlayPixels++
                }
                assertTrue("Text/sticker must be burned into export", overlayPixels > 20)
                frame.recycle()
            } finally { reader.release() }
        } finally { output?.delete(); source.delete() }
    }

    @Test fun trimWithoutMuteRetainsAudioTrack() = runBlocking {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val source = File(context.cacheDir, "video-editor-audio-source.mp4")
        instrumentation.context.assets.open("video-editor-source.mp4").use { input ->
            source.outputStream().use { input.copyTo(it) }
        }
        var output: File? = null
        try {
            output = exportVideo(context, Uri.fromFile(source), VideoEdits(startMs = 500, endMs = 2500))
            val extractor = MediaExtractor()
            try {
                extractor.setDataSource(output.absolutePath)
                assertTrue((0 until extractor.trackCount).any {
                    extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
                })
            } finally { extractor.release() }
        } finally { output?.delete(); source.delete() }
    }
}
