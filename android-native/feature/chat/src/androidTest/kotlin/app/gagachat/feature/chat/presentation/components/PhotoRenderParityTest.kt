package app.gagachat.feature.chat.presentation.components

import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.*
import org.junit.Test

class PhotoRenderParityTest {
    @Test fun cropRotationAndMosaicUseRealPixelsAndLeaveSourceUntouched() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File.createTempFile("photo-render", ".png", context.cacheDir)
        val original = Bitmap.createBitmap(240, 160, Bitmap.Config.ARGB_8888)
        for (y in 0 until 160) for (x in 0 until 240)
            original.setPixel(x, y, if ((x / 4 + y / 4) % 2 == 0) Color.WHITE else Color.BLACK)
        file.outputStream().use { original.compress(Bitmap.CompressFormat.PNG, 100, it) }
        original.recycle()
        val bytes = file.readBytes()
        try {
            val rotated = renderEditedPhoto(context, Uri.fromFile(file), 90, false, PhotoCrop.ORIGINAL, "")
            assertEquals(160, rotated.width)
            assertEquals(240, rotated.height)
            rotated.recycle()
            val plain = renderEditedPhoto(context, Uri.fromFile(file), 0, false, PhotoCrop.SQUARE, "")
            val marked = renderEditedPhoto(context, Uri.fromFile(file), 0, false, PhotoCrop.SQUARE, "",
                PhotoAnnotations(strokes = listOf(DoodleStroke(listOf(NormPoint(0.2f, 0.5f),
                    NormPoint(0.8f, 0.5f)), Color.RED, 0.2f, mosaic = true))))
            assertEquals(160, marked.width)
            assertEquals(160, marked.height)
            val a = IntArray(160 * 160)
            val b = IntArray(160 * 160)
            plain.getPixels(a, 0, 160, 0, 0, 160, 160)
            marked.getPixels(b, 0, 160, 0, 0, 160, 160)
            assertTrue(a.indices.count { a[it] != b[it] } > 20)
            assertEquals(a[0], b[0])
            assertArrayEquals(bytes, file.readBytes())
            plain.recycle()
            marked.recycle()
        } finally { file.delete() }
    }
}
