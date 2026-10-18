package app.gagachat.core.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import app.gagachat.core.ui.component.GagaTextField
import app.gagachat.core.ui.component.GagaPasswordField
import app.gagachat.core.ui.theme.GagaTheme
import app.gagachat.core.ui.theme.LightColors
import app.gagachat.core.ui.theme.DarkColors
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ThemeAndInputTest {
    @get:Rule val compose = createComposeRule()
    private fun contrast(a: Color, b: Color): Float {
        val x = a.luminance(); val y = b.luminance()
        return (maxOf(x,y) + 0.05f) / (minOf(x,y) + 0.05f)
    }
    @Test fun semanticTextHasReadableContrastInBothThemes() {
        for (c in listOf(LightColors, DarkColors)) {
            for ((foreground, background) in listOf(
                c.onPrimary to c.primary, c.onSurface to c.surface,
                c.onSurfaceVariant to c.surfaceContainerHighest, c.error to c.surface,
                c.onError to c.error, c.onErrorContainer to c.errorContainer,
            )) assertTrue("Normal text contrast must be at least 4.5:1", contrast(foreground, background) >= 4.5f)
            assertTrue("Input outline must remain visible", contrast(c.outline,c.surface) >= 3f)
        }
    }
    @Test fun keyboardNextMovesToPasswordAndDoneSubmitsOnce() {
        var submissions = 0
        compose.setContent {
            GagaTheme {
                Column {
                    GagaTextField("sample@example.test", {}, "Email")
                    GagaPasswordField("secret", {}, "Password", onDone = { submissions++ })
                }
            }
        }
        compose.onNodeWithText("Email").performClick().performImeAction()
        compose.onNodeWithText("Password").assertIsFocused().performImeAction()
        compose.runOnIdle { assertEquals(1, submissions) }
    }
}
