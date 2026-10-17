package app.gagachat.feature.chat.presentation.components

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.File

class ReferenceSharingTest {
    @get:Rule val compose = createComposeRule()

    @Test fun mediaActionsDoNothingUntilChosenAndCancelNeverShares() {
        var sends = 0
        var cancels = 0
        compose.setContent { MaterialTheme {
            MediaActionsSheet(true, onDismiss = { cancels++ }, onSave = {}, onShare = {}, onOpen = {}, onExtract = {},
                onForward = { sends++ }, onFavorite = {}, onEdit = {}, onLocate = {}, onAllMedia = {})
        } }
        compose.waitForIdle()
        assertEquals(0, sends)
        compose.onNodeWithText("Send to chat").performClick()
        assertEquals(1, sends)
        compose.onNodeWithText("Cancel").performClick()
        assertEquals(1, sends)
        assertEquals(1, cancels)
    }

    @Test fun monoFilterIsExportedWithoutTextOrAnnotationsAndPreservesOriginal() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val input = File(context.cacheDir, "reference-red.png")
        val bitmap = Bitmap.createBitmap(160, 120, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.RED) }
        input.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
        val original = input.readBytes()
        val edited = writeEditedPhoto(context, Uri.fromFile(input), 0, false, PhotoCrop.ORIGINAL, "", filter = PhotoFilter.MONO)
        val result = BitmapFactory.decodeFile(edited.path)
        val pixel = result.getPixel(80, 60)
        assertTrue(kotlin.math.abs(Color.red(pixel) - Color.green(pixel)) <= 3)
        assertTrue(kotlin.math.abs(Color.green(pixel) - Color.blue(pixel)) <= 3)
        assertArrayEquals(original, input.readBytes())
        result.recycle()
    }
}
