package app.gagachat

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import app.gagachat.core.data.preferences.SettingsPreferences
import app.gagachat.core.data.preferences.TextScale
import app.gagachat.core.data.preferences.ThemeMode
import app.gagachat.core.ui.theme.GagaTheme
import app.gagachat.navigation.GagaApp
import app.gagachat.push.DeepLinkRouter
import app.gagachat.push.PendingDeepLink
import app.gagachat.security.AppLockGate
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Single-activity host (PDF §2.1). Edge-to-edge is enabled so the Compose UI
 * owns the full window; the splash screen keeps the first frame warm while the
 * session bootstrap runs (PDF §3).
 *
 * The root theme is driven by the persisted appearance settings (Master Spec
 * §C): [ThemeMode] selects light/dark/system and [TextScale] scales typography,
 * so changing them in Settings takes effect immediately without a restart.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var settingsPreferences: SettingsPreferences

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(LocaleHelper.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Recreate the Activity when the language changes so the new locale is
        // applied through attachBaseContext (drop(1) skips the initial emission).
        lifecycleScope.launch {
            settingsPreferences.language.drop(1).collect { recreate() }
        }

        // Keep the splash up only until the first composition is ready.
        var ready = false
        splash.setKeepOnScreenCondition { !ready }

        // Capture a cold-start deep link so the nav host can route once ready.
        intent?.let { DeepLinkRouter.capture(it) }

        setContent {
            val themeMode by settingsPreferences.themeMode
                .collectAsStateWithLifecycle(initialValue = ThemeMode.SYSTEM)
            val textScale by settingsPreferences.textScale
                .collectAsStateWithLifecycle(initialValue = TextScale.DEFAULT)
            val appLockEnabled by settingsPreferences.appLockEnabled
                .collectAsStateWithLifecycle(initialValue = false)

            val darkTheme = when (themeMode) {
                ThemeMode.LIGHT -> false
                ThemeMode.DARK -> true
                ThemeMode.SYSTEM -> isSystemInDarkTheme()
            }

            GagaTheme(darkTheme = darkTheme, textScale = textScale.factor()) {
                ready = true
                AppLockGate(enabled = appLockEnabled) {
                    GagaApp(pendingDeepLink = PendingDeepLink.current)
                }
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        DeepLinkRouter.capture(intent)
    }
}

/** Maps the persisted [TextScale] preference to a typography multiplier. */
private fun TextScale.factor(): Float = when (this) {
    TextScale.SMALL -> 0.9f
    TextScale.DEFAULT -> 1f
    TextScale.LARGE -> 1.15f
}
