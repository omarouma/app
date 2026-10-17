package app.gagachat.core.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalDensity
import app.gagachat.core.ui.component.GagaTopAppBar
import app.gagachat.core.ui.theme.GagaTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ChatHeaderLayoutTest {
    @get:Rule val compose = createComposeRule()
    private fun verify(scale: Float, width: Int) {
        var opened = false
        val name = "A very long conversation name for a small phone"
        compose.setContent {
            GagaTheme(textScale = scale) {
                Box(Modifier.width(width.dp)) {
                    GagaTopAppBar(title = name, subtitle = "Online now · conversation details",
                        onBack = {}, onTitleClick = {}, actions = {
                            IconButton(onClick = { opened = true }) { Icon(Icons.Default.MoreVert, "More") }
                        })
                }
            }
        }
        val title = compose.onNodeWithText(name).assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        val action = compose.onNodeWithContentDescription("More").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        val back = compose.onNodeWithContentDescription("Back").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        assertTrue("Title stays between back and actions", title.left >= back.right && title.right <= action.left)
        compose.onNodeWithContentDescription("More").performClick()
        assertTrue("Menu action remains reachable", opened)
    }
    @Test fun narrowPhone() = verify(1f, 320)
    @Test fun narrowPhoneWithLargeText() = verify(2f, 320)
    @Test fun narrowPhoneWithMaximumText() = verify(3f, 320)
    @Test fun standardPhone() = verify(1f, 360)
    @Test fun compactTabletOrLandscape() = verify(1.15f, 412)

    @Test fun compactGaGaHeaderRetainsCreateAndQrAt320dp() {
        var created = false
        var scanned = false
        compose.setContent {
            GagaTheme {
                Box(Modifier.width(320.dp)) {
                    GagaTopAppBar(
                        title = "GaGa",
                        brandMark = true,
                        compactHeader = true,
                        actions = {
                            IconButton(onClick = { created = true }) {
                                Icon(Icons.Default.Add, "Create chat or group")
                            }
                            IconButton(onClick = { scanned = true }) {
                                Icon(Icons.Default.QrCodeScanner, "Scan QR code")
                            }
                        },
                    )
                }
            }
        }
        compose.onNodeWithText("GaGa").assertIsDisplayed()
        compose.onNodeWithContentDescription("Create chat or group").assertIsDisplayed().performClick()
        compose.onNodeWithContentDescription("Scan QR code").assertIsDisplayed().performClick()
        assertTrue(created)
        assertTrue(scanned)
    }
}
