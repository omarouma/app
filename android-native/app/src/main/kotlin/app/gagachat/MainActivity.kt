package app.gagachat

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import app.gagachat.navigation.GagaApp
import app.gagachat.push.DeepLinkRouter
import app.gagachat.push.PendingDeepLink
import app.gagachat.core.ui.theme.GagaTheme
import dagger.hilt.android.AndroidEntryPoint

/**
 * Single-activity host (PDF §2.1). Edge-to-edge is enabled so the Compose UI
 * owns the full window; the splash screen keeps the first frame warm while the
 * session bootstrap runs (PDF §3).
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Keep the splash up only until the first composition is ready.
        var ready = false
        splash.setKeepOnScreenCondition { !ready }

        // Capture a cold-start deep link so the nav host can route once ready.
        intent?.let { DeepLinkRouter.capture(it) }

        setContent {
            GagaTheme {
                ready = true
                GagaApp(pendingDeepLink = PendingDeepLink.current)
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        DeepLinkRouter.capture(intent)
    }
}
