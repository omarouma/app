package app.gagachat.core.ui

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import app.gagachat.core.model.LayoutSize
import app.gagachat.core.ui.component.GagaSearchBar
import app.gagachat.core.ui.theme.GagaTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class CompactSearchBarTest {
    @get:Rule val compose = createComposeRule()
    private fun verify(size: LayoutSize, scale: Float) {
        compose.setContent {
            var query by remember { mutableStateOf("") }
            GagaTheme(layoutSize = size, textScale = scale) {
                Box(Modifier.width(320.dp)) {
                    GagaSearchBar(query, { query = it }, Modifier.testTag("search"), "Search people")
                }
            }
        }
        val input = compose.onNode(hasSetTextAction())
        input.assertIsDisplayed().assertHeightIsAtLeast(48.dp)
        input.performTextInput("GaGa")
        input.assertTextContains("GaGa")
        compose.onNodeWithContentDescription("Clear").assertIsDisplayed().performClick()
        input.assertTextEquals("")
        compose.onNodeWithText("Search people").assertIsDisplayed()
        val bounds = input.fetchSemanticsNode().boundsInRoot
        assertTrue("Search stays inside narrow phone", bounds.left >= 0 && bounds.right <= compose.onRoot().fetchSemanticsNode().boundsInRoot.right)
    }
    @Test fun compactSearchEditsAndClears() = verify(LayoutSize.COMPACT, 1f)
    @Test fun compactSearchAllowsLargeText() = verify(LayoutSize.COMPACT, 2f)
    @Test fun roomySearchEditsAndClears() = verify(LayoutSize.ROOMY, 1f)
}
