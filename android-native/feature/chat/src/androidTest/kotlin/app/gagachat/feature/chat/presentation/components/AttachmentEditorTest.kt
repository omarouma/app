package app.gagachat.feature.chat.presentation.components

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** Android runtime tests of real Bitmap editing and private in-chat mapping. */
class AttachmentEditorTest {
    @get:Rule val compose = createComposeRule()

    @Test fun cropCenterHasExpectedDimensions() {
        val square = centeredCrop(200, 100, PhotoCrop.SQUARE.aspect)
        assertEquals(100, square.width())
        assertEquals(100, square.height())
        assertEquals(50, square.left)
        val portrait = centeredCrop(100, 200, PhotoCrop.PORTRAIT.aspect)
        assertEquals(100, portrait.width())
        assertEquals(125, portrait.height())
    }

    @Test fun editedImageKeepsOriginalAndWritesSquare() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "original_editor_test.jpg")
        val bmp = Bitmap.createBitmap(120, 60, Bitmap.Config.ARGB_8888)
        file.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        bmp.recycle()
        val originalLength = file.length()
        val edited = writeEditedPhoto(context, Uri.fromFile(file), 90, true, PhotoCrop.SQUARE, "Hello")
        val resultFile = File(requireNotNull(edited.path))
        val output = BitmapFactory.decodeFile(resultFile.absolutePath)
        assertEquals(output.width, output.height)
        assertTrue(resultFile.length() > 0L)
        assertEquals(originalLength, file.length())
        output.recycle()
        resultFile.delete()
        file.delete()
    }

    @Test fun mapMercatorRoundTripsLocations() {
        listOf(23.8103 to 90.4125, 0.0 to 0.0, -33.86 to 151.20).forEach { (lat, lng) ->
            val (x, y) = mapWorld(lat, lng, 16)
            val (restoredLat, restoredLng) = worldCoordinate(x, y, 16)
            assertEquals(lat, restoredLat, 0.00001)
            assertEquals(lng, restoredLng, 0.00001)
        }
    }

    @Test fun inAppMapRendersOwnPin() {
        compose.setContent {
            MaterialTheme {
                GagaTiledMap(latitude = 23.8103, longitude = 90.4125,
                    zoom = 16, onSelected = { _, _ -> })
            }
        }
        compose.onNodeWithText("© Esri · World Street Map").assertIsDisplayed()
    }
}
