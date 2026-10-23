package app.gagachat.core.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import app.gagachat.core.ui.i18n.GagaLanguages
import app.gagachat.core.ui.i18n.LocalGagaStrings
import app.gagachat.core.ui.i18n.gagaStringsFor

internal val LightColors = lightColorScheme(
    primary = GagaGreenDark,
    onPrimary = Color.White,
    primaryContainer = GagaGreenContainer,
    onPrimaryContainer = Color(0xFF075C2E),
    secondary = Color(0xFF006B57),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFD6F0E7),
    onSecondaryContainer = Color(0xFF064C3C),
    tertiary = Color(0xFF37634B),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFD6EADC),
    onTertiaryContainer = Color(0xFF173C26),
    inverseSurface = Color(0xFF26382E),
    inverseOnSurface = Color(0xFFEFF6F0),
    inversePrimary = GagaGreenLight,
    background = LightBackground,
    onBackground = LightOnSurface,
    surface = LightSurface,
    onSurface = LightOnSurface,
    surfaceVariant = LightSurfaceVariant,
    onSurfaceVariant = LightOnSurfaceVariant,
    outline = Color(0xFF718078),
    outlineVariant = LightOutline,
    surfaceTint = GagaGreen,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF0F5F1),
    surfaceContainer = Color(0xFFEBF1EC),
    surfaceContainerHigh = Color(0xFFE5ECE7),
    surfaceContainerHighest = Color(0xFFDFE7E1),
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
    error = ErrorRed,
    onError = Color.White,
)

internal val DarkColors = darkColorScheme(
    primary = GagaGreenLight,
    onPrimary = Color(0xFF003300),
    primaryContainer = GagaGreenDark,
    onPrimaryContainer = Color.White,
    secondary = Color(0xFF6EDBB7),
    onSecondary = Color(0xFF04201D),
    secondaryContainer = Color(0xFF164D3E),
    onSecondaryContainer = Color(0xFFBAF1D7),
    tertiary = Color(0xFFA8D0B1),
    onTertiary = Color(0xFF123921),
    tertiaryContainer = Color(0xFF234E34),
    onTertiaryContainer = Color(0xFFD6EADC),
    inverseSurface = Color(0xFFE5EEE7),
    inverseOnSurface = Color(0xFF1B2B22),
    inversePrimary = GagaGreenDark,
    background = DarkBackground,
    onBackground = DarkOnSurface,
    surface = DarkSurface,
    onSurface = DarkOnSurface,
    surfaceVariant = DarkSurfaceVariant,
    onSurfaceVariant = DarkOnSurfaceVariant,
    outline = Color(0xFF899C8F),
    outlineVariant = DarkOutline,
    surfaceTint = GagaGreenLight,
    surfaceContainerLowest = Color(0xFF0B140F),
    surfaceContainerLow = Color(0xFF15251C),
    surfaceContainer = Color(0xFF1B2B22),
    surfaceContainerHigh = Color(0xFF24352B),
    surfaceContainerHighest = Color(0xFF2E4035),
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
)

/**
 * Extra semantic colors that Material 3 does not model directly (chat bubbles,
 * presence dots). Exposed through a CompositionLocal so components can read
 * them without hard-coding light/dark branches.
 */
data class GagaExtraColors(
    val outgoingBubble: Color,
    val incomingBubble: Color,
    val onOutgoingBubble: Color,
    val onIncomingBubble: Color,
    val statusOnline: Color,
    val statusAway: Color,
    val statusBusy: Color,
    val statusOffline: Color,
    val success: Color,
    val warning: Color,
)

internal val LightExtraColors = GagaExtraColors(
    outgoingBubble = OutgoingBubbleLight,
    incomingBubble = IncomingBubbleLight,
    onOutgoingBubble = LightOnSurface,
    onIncomingBubble = LightOnSurface,
    statusOnline = StatusOnline,
    statusAway = StatusAway,
    statusBusy = StatusBusy,
    statusOffline = StatusOffline,
    success = SuccessGreen,
    warning = Color(0xFF8C5000),
)

internal val DarkExtraColors = GagaExtraColors(
    outgoingBubble = OutgoingBubbleDark,
    incomingBubble = IncomingBubbleDark,
    onOutgoingBubble = DarkOnSurface,
    onIncomingBubble = DarkOnSurface,
    statusOnline = GagaGreenLight,
    statusAway = Color(0xFFFFCE84),
    statusBusy = Color(0xFFFFB4AB),
    statusOffline = DarkOnSurfaceVariant,
    success = GagaGreenLight,
    warning = Color(0xFFFFCE84),
)

val LocalGagaExtraColors = staticCompositionLocalOf { LightExtraColors }

object GagaTheme {
    val extraColors: GagaExtraColors
        @Composable get() = LocalGagaExtraColors.current
}

val LocalGagaLayoutSize = androidx.compose.runtime.staticCompositionLocalOf { app.gagachat.core.model.LayoutSize.COMPACT }

@Composable
fun GagaTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    textScale: Float = 1f,
    languageCode: String = GagaLanguages.ENGLISH,
    layoutSize: app.gagachat.core.model.LayoutSize = app.gagachat.core.model.LayoutSize.COMPACT,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColors
        else -> LightColors
    }
    val extraColors = if (darkTheme) DarkExtraColors else LightExtraColors
    // Resolved from the persisted language so switching it re-renders every
    // surface that reads LocalGagaStrings without a resource re-resolve.
    val strings = gagaStringsFor(languageCode)

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }

    CompositionLocalProvider(
        LocalGagaLayoutSize provides layoutSize,
        LocalGagaExtraColors provides extraColors,
        LocalGagaStrings provides strings,
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = scaledTypography(textScale),
            shapes = GagaShapes,
            content = content,
        )
    }
}

/** Dark control colors for a black media canvas, without changing system-bar state. */
@Composable
fun GagaMediaTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalGagaExtraColors provides DarkExtraColors) {
        MaterialTheme(
            colorScheme = DarkColors,
            typography = MaterialTheme.typography,
            shapes = MaterialTheme.shapes,
            content = content,
        )
    }
}
