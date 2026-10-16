package app.gagachat.feature.contacts.presentation

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import app.gagachat.core.model.User
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class ContactRemarkDialogTest {
    @get:Rule val compose = createComposeRule()

    @Test fun privateRemarkFormDisplaysPersistedDataAndExplicitSave() {
        var saved: PrivateContactRemark? = null
        val contact = User(id = "c8234b5a-bb94-4d27-8f46-7c21215686ef",
            displayName = "Sample Friend")
        compose.setContent {
            MaterialTheme {
                ContactRemarkDialog(
                    contact = contact,
                    initial = PrivateContactRemark(
                        alias = "My colleague",
                        mobile = "",
                        tags = listOf("Work"),
                        remark = "Met at university",
                    ),
                    saving = false,
                    error = null,
                    onDismiss = {},
                    onSave = { alias, phone, tags, note ->
                        saved = PrivateContactRemark(alias, phone, tags, note)
                    },
                )
            }
        }
        compose.onNodeWithText("Set remarks").assertIsDisplayed()
        compose.onNodeWithText("Only you can see these details").assertIsDisplayed()
        compose.onNodeWithText("My colleague").assertIsDisplayed()
        compose.onNodeWithText("Done").performClick()
        assertEquals("My colleague", saved?.alias)
        assertEquals(listOf("Work"), saved?.tags)
        assertEquals("Met at university", saved?.remark)
    }
}
