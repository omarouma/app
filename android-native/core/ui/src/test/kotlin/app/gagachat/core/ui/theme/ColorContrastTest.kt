package app.gagachat.core.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import org.junit.Assert.*
import org.junit.Test

class ColorContrastTest {
    private fun readable(foreground: Color, background: Color) {
        assertTrue("Contrast ${contrastRatio(foreground, background)} is below 4.5:1", contrastRatio(foreground, background) >= 4.5)
    }

    private fun checkScheme(colors: ColorScheme) {
        with(colors) {
            readable(onPrimary, primary)
            readable(onPrimaryContainer, primaryContainer)
            readable(onSecondary, secondary)
            readable(onSecondaryContainer, secondaryContainer)
            readable(onTertiary, tertiary)
            readable(onTertiaryContainer, tertiaryContainer)
            readable(onSurface, surface)
            readable(onBackground, background)
            readable(onSurfaceVariant, surfaceVariant)
            readable(onSurfaceVariant, surfaceContainerHighest)
            readable(primary, surfaceContainerHighest)
            readable(secondary, surfaceContainerHighest)
            readable(tertiary, surfaceContainerHighest)
            readable(onError, error)
            readable(onErrorContainer, errorContainer)
            readable(inverseOnSurface, inverseSurface)
            readable(inversePrimary, inverseSurface)
        }
    }

    @Test fun lightAndDarkSemanticTextPairsAreReadable() {
        checkScheme(LightColors)
        checkScheme(DarkColors)
        for (extra in listOf(LightExtraColors, DarkExtraColors)) {
            readable(extra.onOutgoingBubble, extra.outgoingBubble)
            readable(extra.onIncomingBubble, extra.incomingBubble)
        }
        readable(LightExtraColors.success, LightColors.surfaceContainerHighest)
        readable(DarkExtraColors.success, DarkColors.surfaceContainerHighest)
        readable(LightExtraColors.warning, LightColors.surface)
        readable(DarkExtraColors.warning, DarkColors.surface)
    }

    @Test fun paleToolIconsAndDarkModeAccentsAreAdjustedOnTheirActualContainer() {
        val accents = listOf(Color(0xFFDE8E48), Color(0xFFC4962C), Color(0xFF559A91), GagaGreen, Color(0xFF5268B5))
        for (scheme in listOf(LightColors, DarkColors)) {
            for (accent in accents) {
                val background = accent.copy(alpha = .12f).compositeOver(scheme.surface)
                readable(readableAccent(accent, background), background)
            }
        }
    }

    @Test fun readableAccentsStayUnchangedAndAlphaIsNotIgnored() {
        assertEquals(GagaGreen, readableAccent(GagaGreen, Color.White))
        val faded = Color.Black.copy(alpha = .1f)
        assertTrue(contrastRatio(faded, Color.White) < 2.0)
        readable(readableAccent(faded, Color.White), Color.White)
    }

    @Test fun whiteMediaLabelsRemainReadableEvenOverAWhitePhoto() {
        val darkestRequiredScrim = MediaLabelScrim.compositeOver(Color.White)
        readable(Color.White, darkestRequiredScrim)
    }

    @Test fun avatarInitialsStayReadableOnBrightAndDarkColors() {
        listOf(GagaGreen, GagaTeal, Color(0xFF43A047), Color(0xFF005C4B)).forEach {
            readable(readableAccent(Color.White, it), it)
        }
    }
}
