package app.gagachat.feature.chat.presentation.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test

class ContactShareReviewTest {
    @get:Rule val compose = createComposeRule()

    @Test fun contactPhoneIsExcludedUnlessUserOptsIn() {
        var sentName: String? = null
        var sentPhone: String? = null
        var count = 0
        compose.setContent {
            MaterialTheme {
                ContactShareReviewDialog(
                    contact = PickedContact("Sample Contact", "+880123456789"),
                    onCancel = {},
                    onConfirm = { name, phone ->
                        sentName = name
                        sentPhone = phone
                        count++
                    },
                )
            }
        }
        compose.onNodeWithText("Sample Contact").assertIsDisplayed()
        compose.onNodeWithText("Include phone number").assertIsDisplayed()
        assertEquals(0, count)
        compose.onNodeWithText("Send card").performClick()
        assertEquals(1, count)
        assertEquals("Sample Contact", sentName)
        assertNull(sentPhone)
    }

    @Test fun cancelDoesNotShareContact() {
        var sent = false
        var cancelled = false
        compose.setContent {
            MaterialTheme {
                ContactShareReviewDialog(
                    contact = PickedContact("Sample Contact", null),
                    onCancel = { cancelled = true },
                    onConfirm = { _, _ -> sent = true },
                )
            }
        }
        compose.onNodeWithText("Cancel").performClick()
        assertFalse(sent)
        assertEquals(true, cancelled)
    }
}
