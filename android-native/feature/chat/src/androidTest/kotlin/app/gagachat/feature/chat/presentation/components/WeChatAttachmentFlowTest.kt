package app.gagachat.feature.chat.presentation.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
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
        compose.onNodeWithText("Send location").assertIsDisplayed()
        compose.onNodeWithText("Send").performClick()
        assertEquals(23.8103, sent!!.first, 0.00001)
        assertEquals(90.4125, sent!!.second, 0.00001)
    }
}
