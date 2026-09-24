package app.gagachat.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * Root composable. Swaps between the auth graph and the main graph based on the
 * persisted session (PDF §3). A valid session renders Home directly with no
 * landing/login screen.
 */
@Composable
fun GagaApp(
    pendingDeepLink: String?,
    viewModel: AppViewModel = hiltViewModel(),
) {
    val session by viewModel.session.collectAsStateWithLifecycle()

    if (session == null) {
        AuthNavHost()
    } else {
        MainNavHost(pendingDeepLink = pendingDeepLink)
    }
}
