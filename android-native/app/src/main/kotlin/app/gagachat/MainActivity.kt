package app.gagachat

import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import app.gagachat.core.data.preferences.SettingsPreferences
import app.gagachat.core.data.preferences.TextScale
import app.gagachat.core.data.preferences.ThemeMode
import app.gagachat.core.ui.theme.GagaTheme
import app.gagachat.diagnostics.CrashReportGate
import app.gagachat.feature.calls.call.CallPipController
import app.gagachat.navigation.AppViewModel
import app.gagachat.navigation.GagaApp
import app.gagachat.push.DeepLinkRouter
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

    /**
     * Shared with the [GagaApp] composable (same Activity-scoped store) so the
     * App Lock gate can be applied only to a restored session — the "Existing
     * User: Restore Session → App Lock → Home" step (Master Spec §C).
     */
    private val appViewModel: AppViewModel by viewModels()

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
            val session by appViewModel.session.collectAsStateWithLifecycle()

            val darkTheme = when (themeMode) {
                ThemeMode.LIGHT -> false
                ThemeMode.DARK -> true
                ThemeMode.SYSTEM -> isSystemInDarkTheme()
            }

            GagaTheme(darkTheme = darkTheme, textScale = textScale.factor()) {
                ready = true
                // Surface the previous run's crash (if any) so the exact stack
                // trace can be copied/screenshotted even when we cannot attach a
                // debugger. The report is also written to Downloads/gaga_crash.txt.
                CrashReportGate {
                    // App Lock only guards a restored session, never the
                    // signed-out auth flow (Master Spec §C).
                    AppLockGate(enabled = appLockEnabled && session != null) {
                        GagaApp()
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        DeepLinkRouter.capture(intent)
    }

    /**
     * Picture-in-Picture for live calls. On Android 12+ the system auto-enters PiP
     * via [CallPipController.buildParams]'s `autoEnterEnabled`; on older releases
     * we enter here when the user presses Home mid-call. Both paths are guarded so
     * a non-call Home press behaves exactly as before.
     */
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S && CallPipController.callActive) {
            enterCallPip()
        }
    }

    /** Keeps [CallPipController] in sync so the call UI can switch to its PiP layout. */
    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration,
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        CallPipController.onPipChanged(isInPictureInPictureMode)
    }

    private fun enterCallPip() {
        try {
            enterPictureInPictureMode(CallPipController.buildParams())
        } catch (_: Throwable) {
            // PiP is best-effort: a device that refuses it must not crash the call.
        }
    }
}

/** Maps the persisted [TextScale] preference to a typography multiplier. */
private fun TextScale.factor(): Float = when (this) {
    TextScale.SMALL -> 0.9f
    TextScale.DEFAULT -> 1f
    TextScale.LARGE -> 1.15f
}
