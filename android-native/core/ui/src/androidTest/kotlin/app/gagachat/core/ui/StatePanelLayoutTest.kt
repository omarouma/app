package app.gagachat.core.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import app.gagachat.core.ui.component.*
import app.gagachat.core.ui.theme.GagaTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class StatePanelLayoutTest {
    @get:Rule val compose = createComposeRule()
    @Test fun retryRemainsReachableInShortLargeTextViewport() {
        var retried = false
        compose.setContent {
            GagaTheme(textScale = 2f) {
                Box(Modifier.width(320.dp).height(220.dp)) {
                    GagaErrorState("Unable to load conversations", description = "Check your internet connection and try loading your conversations again.", onRetry = { retried = true })
                }
            }
        }
        compose.onNodeWithText("Retry").performScrollTo().assertIsDisplayed().performClick()
        assertTrue(retried)
    }
    @Test fun emptyStateCanRenderInsideUnboundedLazyItem() {
        compose.setContent {
            GagaTheme {
                LazyColumn(Modifier.width(320.dp).height(240.dp)) {
                    item { GagaEmptyState(Icons.Default.Inbox, "No results", description = "Try another search") }
                }
            }
        }
        compose.onNodeWithText("No results").assertIsDisplayed()
    }
}
