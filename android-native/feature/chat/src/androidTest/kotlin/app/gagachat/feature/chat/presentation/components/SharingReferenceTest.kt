package app.gagachat.feature.chat.presentation.components

import android.graphics.Bitmap
import android.graphics.Color
import android.location.Address
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import java.util.Locale
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class SharingReferenceTest {
    @get:Rule val compose = createComposeRule()

    @Test fun contactRequiresExplicitConfirmationAndCannotSendTwice() {
        var sends = 0
        compose.setContent {
            MaterialTheme {
                ContactShareDialog(PickedContact("Example contact", "+8801000000000"), "Test chat", {}, { sends++ })
            }
        }
        compose.onNodeWithText("Send to: Test chat").assertIsDisplayed()
        compose.runOnIdle { assertEquals(0, sends) }
        compose.onNodeWithText("Send").performClick()
        compose.onNodeWithText("Send").assertIsNotEnabled()
        compose.runOnIdle { assertEquals(1, sends) }
    }

    @Test fun missingOrInvalidCoordinatesAreNotOfferedAsPlaces() {
        val address = Address(Locale.US)
        assertNull(address.toPlaceResult())
        address.latitude = Double.NaN
        address.longitude = 90.4
        assertNull(address.toPlaceResult())
        address.latitude = 23.8
        address.featureName = "Example place"
        address.setAddressLine(0, "Example street")
        assertEquals("Example street", address.toPlaceResult()?.address)
        assertEquals("Example place", address.toPlaceResult()?.title)
    }

    @Test fun drawingAndMosaicChangeOnlyMarkedPhotoPixels() {
        val bitmap = Bitmap.createBitmap(240, 160, Bitmap.Config.ARGB_8888)
        for (y in 0 until 160) for (x in 0 until 240)
            bitmap.setPixel(x, y, if ((x / 4 + y / 4) % 2 == 0) Color.WHITE else Color.BLACK)
        val outside = bitmap.getPixel(0, 0)
        drawPhotoMarks(bitmap, listOf(PhotoStroke(listOf(PhotoPoint(0.2f, 0.5f), PhotoPoint(0.8f, 0.5f)), Color.RED)), "")
        assertEquals(Color.RED, bitmap.getPixel(120, 80))
        assertEquals(outside, bitmap.getPixel(0, 0))
        val before = IntArray(240 * 160)
        bitmap.getPixels(before, 0, 240, 0, 0, 240, 160)
        drawPhotoMarks(bitmap, listOf(PhotoStroke(listOf(PhotoPoint(0.2f, 0.3f), PhotoPoint(0.8f, 0.3f)), Color.BLACK, true)), "")
        val after = IntArray(240 * 160)
        bitmap.getPixels(after, 0, 240, 0, 0, 240, 160)
        assertTrue(before.indices.count { before[it] != after[it] } > 20)
        assertEquals(outside, bitmap.getPixel(0, 0))
        bitmap.recycle()
    }
}
