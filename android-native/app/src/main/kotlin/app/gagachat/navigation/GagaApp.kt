package app.gagachat.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.core.ui.component.GagaOfflineBanner
import app.gagachat.feature.onboarding.OnboardingNavHost
import app.gagachat.push.PendingDeepLink

/**
 * Root composable. Swaps between the auth graph, the first-run onboarding graph
 * and the main graph based on the persisted session + onboarding flag
 * (PDF §3, Master Spec §C).
 *
 * Order of gates:
 *  1. No session → Auth graph (login / sign-up).
 *  2. Session + this account still needs profile setup → Onboarding graph.
 *     Profile setup is shown ONLY for a freshly created account, never on a
 *     returning login (see [AppViewModel.needsOnboarding]).
 *  3. Session + profile setup done → Main graph (Home and everything else).
 *
 * It also owns the app-wide offline banner and the reconnect recovery hook
 * (Master Spec §E): when connectivity returns, the outbox is flushed and the
 * realtime socket is re-joined automatically.
 *
 * Deep links (notification taps, external links, live call invites) are read
 * from [PendingDeepLink] as observable state, so they route whether they arrive
 * before the first frame or long after it.
 */
@Composable
fun GagaApp(
    viewModel: AppViewModel = hiltViewModel(),
) {
    val session by viewModel.session.collectAsStateWithLifecycle()
    val needsOnboarding by viewModel.needsOnboarding.collectAsStateWithLifecycle()
    val isOnline by viewModel.isOnline.collectAsStateWithLifecycle()
    // Observed rather than read once: a deep link that arrives *after* the first
    // composition still has to route. That covers a warm-start notification tap
    // (onNewIntent) and a live Realtime call invite, both of which land while the
    // app is already running and the nav host is already on screen.
    val pendingDeepLink by PendingDeepLink.route.collectAsStateWithLifecycle()

    // Fire only on an offline → online transition so we don't restart the socket
    // on every recomposition or on the initial (already-online) frame.
    var wasOnline by remember { mutableStateOf(isOnline) }
    LaunchedEffect(isOnline) {
        if (isOnline && !wasOnline) viewModel.onReconnected()
        wasOnline = isOnline
    }

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            session == null -> AuthNavHost()

            // Onboarding state has not resolved yet — show a neutral splash frame.
            needsOnboarding == null -> GagaLoading(modifier = Modifier.fillMaxSize())

            // Profile setup runs ONLY for a freshly created account (PDF §3).
            needsOnboarding == true -> OnboardingNavHost(
                onFinished = { /* flag flip re-renders this composable into the main graph */ },
            )

            else -> MainNavHost(pendingDeepLink = pendingDeepLink)
        }

        GagaOfflineBanner(
            visible = !isOnline,
            modifier = Modifier.align(Alignment.TopCenter),
        )
    }
}
