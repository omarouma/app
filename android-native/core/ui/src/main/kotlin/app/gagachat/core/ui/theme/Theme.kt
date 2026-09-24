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

private val LightColors = lightColorScheme(
    primary = GagaViolet,
    onPrimary = Color.White,
    primaryContainer = GagaVioletLight,
    onPrimaryContainer = GagaVioletDark,
    secondary = GagaTeal,
    onSecondary = Color.White,
    secondaryContainer = GagaTealDark,
    onSecondaryContainer = Color.White,
    background = LightBackground,
    onBackground = LightOnSurface,
    surface = LightSurface,
    onSurface = LightOnSurface,
    surfaceVariant = LightSurfaceVariant,
    onSurfaceVariant = LightOnSurfaceVariant,
    outline = LightOutline,
    error = ErrorRed,
    onError = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = GagaVioletLight,
    onPrimary = Color(0xFF1B1233),
    primaryContainer = GagaVioletDark,
    onPrimaryContainer = Color.White,
    secondary = GagaTeal,
    onSecondary = Color(0xFF04201D),
    secondaryContainer = GagaTealDark,
    onSecondaryContainer = Color.White,
    background = DarkBackground,
    onBackground = DarkOnSurface,
    surface = DarkSurface,
    onSurface = DarkOnSurface,
    surfaceVariant = DarkSurfaceVariant,
    onSurfaceVariant = DarkOnSurfaceVariant,
    outline = DarkOutline,
    error = ErrorRed,
    onError = Color.White,
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

private val LightExtraColors = GagaExtraColors(
    outgoingBubble = OutgoingBubbleLight,
    incomingBubble = IncomingBubbleLight,
    onOutgoingBubble = LightOnSurface,
    onIncomingBubble = LightOnSurface,
    statusOnline = StatusOnline,
    statusAway = StatusAway,
    statusBusy = StatusBusy,
    statusOffline = StatusOffline,
    success = SuccessGreen,
    warning = WarningAmber,
)

private val DarkExtraColors = GagaExtraColors(
    outgoingBubble = OutgoingBubbleDark,
    incomingBubble = IncomingBubbleDark,
    onOutgoingBubble = DarkOnSurface,
    onIncomingBubble = DarkOnSurface,
    statusOnline = StatusOnline,
    statusAway = StatusAway,
    statusBusy = StatusBusy,
    statusOffline = StatusOffline,
    success = SuccessGreen,
    warning = WarningAmber,
)

val LocalGagaExtraColors = staticCompositionLocalOf { LightExtraColors }

object GagaTheme {
    val extraColors: GagaExtraColors
        @Composable get() = LocalGagaExtraColors.current
}

@Composable
fun GagaTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
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

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    CompositionLocalProvider(LocalGagaExtraColors provides extraColors) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = GagaTypography,
            shapes = GagaShapes,
            content = content,
        )
    }
}
