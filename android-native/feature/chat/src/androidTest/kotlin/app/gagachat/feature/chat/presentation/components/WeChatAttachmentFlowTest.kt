package app.gagachat.feature.chat.presentation.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.isDisplayed
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import app.gagachat.feature.chat.presentation.LocationPreview

/** Regression checks for explicit privacy and location-send confirmation. */
class WeChatAttachmentFlowTest {
    @get:Rule val compose = createComposeRule()

    @Test fun contactPhoneIsPrivateUntilUserOptsIn() {
        var sentName: String? = null
        var sentPhone: String? = null
        compose.setContent {
            MaterialTheme {
                ContactCardConfirmDialog(
                    contact = PickedContact("Sample Contact", "+880123456"),
                    onDismiss = {},
                    onConfirm = { name, phone ->
                        sentName = name
                        sentPhone = phone
                    },
                )
            }
        }
        compose.onNodeWithText("Contact name only").assertIsDisplayed()
        compose.onNodeWithText("Send card").performClick()
        assertEquals("Sample Contact", sentName)
        assertNull(sentPhone)
    }

    @Test fun locationPickerRequiresExplicitSend() {
        var sent: Pair<Double, Double>? = null
        compose.setContent {
            MaterialTheme {
                LocationPreviewDialog(
                    preview = LocationPreview(23.8103, 90.4125, 20f, 300L, "gps"),
                    onConfirm = { a,b -> sent = a to b },
                    onDismiss = {},
                )
            }
        }
        // Capture actual window pixels and semantics even when the visibility
        // assertion fails, so layout failures can be diagnosed from CI artifacts.
        try {
            compose.onNodeWithContentDescription("Search for location").performClick().performTextInput("Dhaka")
            assertNull("Typing a search must not send a location", sent)
            compose.waitUntil(timeoutMillis = 5_000) {
                compose.onNodeWithText("Send location").isDisplayed()
            }
            compose.onNodeWithText("Send location").assertIsDisplayed()
            compose.onNodeWithText("Cancel").assertIsDisplayed()
            compose.onNodeWithText("Send").assertIsDisplayed()
        } finally {
            val instrumentation = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
            val directory = java.io.File(instrumentation.targetContext.getExternalFilesDir("screenshots"), "location")
            directory.mkdirs()
            instrumentation.uiAutomation.takeScreenshot()?.let { bitmap ->
                java.io.File(directory, "location-window.png").outputStream().use {
                    bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
                }
                bitmap.recycle()
            }
            java.io.File(directory, "location-semantics.txt").writeText(
                compose.onAllNodes(androidx.compose.ui.test.isRoot()).fetchSemanticsNodes()
                    .joinToString("\n") { it.toString() },
            )
        }
        compose.onNodeWithText("Send").performClick()
        assertEquals(23.8103, sent!!.first, 0.00001)
        assertEquals(90.4125, sent!!.second, 0.00001)
    }
}
