package app.gagachat.core.ui

import androidx.compose.foundation.layout.*
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaSecondaryButton
import app.gagachat.core.ui.theme.GagaTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ActionButtonLayoutTest {
    @get:Rule val compose = createComposeRule()
    @Test fun longLabelsExpandAtLargeTextAndRemainClickable() {
        var clicked = false
        compose.setContent {
            GagaTheme(textScale = 2f) {
                Column(Modifier.width(280.dp)) {
                    GagaPrimaryButton("Continue to verify your email address", onClick = { clicked = true }, modifier = Modifier.testTag("primary"))
                    GagaSecondaryButton("Return to account security settings", onClick = {}, modifier = Modifier.testTag("secondary"))
                }
            }
        }
        val primary = compose.onNodeWithTag("primary").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        val secondary = compose.onNodeWithTag("secondary").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        assertTrue("Primary expands beyond the former 52dp cap", primary.height > 52f)
        assertTrue("Secondary does not overlap primary", secondary.top >= primary.bottom)
        compose.onNodeWithTag("primary").performClick()
        assertTrue(clicked)
    }
}
