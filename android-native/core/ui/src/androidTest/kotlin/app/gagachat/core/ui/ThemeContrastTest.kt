package app.gagachat.core.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.test.junit4.createComposeRule
import app.gagachat.core.ui.theme.GagaTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ThemeContrastTest {
    @get:Rule val compose = createComposeRule()
    private fun verify(dark: Boolean) {
        var pairs: List<Pair<Color, Color>> = emptyList()
        compose.setContent {
            GagaTheme(darkTheme = dark) {
                val c = MaterialTheme.colorScheme
                pairs = listOf(c.onSurface to c.surface, c.onSurfaceVariant to c.surfaceVariant,
                    c.onPrimary to c.primary, c.onPrimaryContainer to c.primaryContainer,
                    c.onSecondary to c.secondary, c.onError to c.error, c.error to c.surface)
            }
        }
        compose.runOnIdle {
            pairs.forEach { (foreground, background) ->
                val a = foreground.luminance(); val b = background.luminance()
                val ratio = (maxOf(a, b) + 0.05f) / (minOf(a, b) + 0.05f)
                assertTrue("Theme text contrast must be at least 4.5:1; was $ratio", ratio >= 4.5f)
            }
        }
    }
    @Test fun lightThemeTextPairs() = verify(false)
    @Test fun darkThemeTextPairs() = verify(true)
}
