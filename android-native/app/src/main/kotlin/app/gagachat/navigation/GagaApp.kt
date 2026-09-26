package app.gagachat.navigation

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.feature.onboarding.OnboardingNavHost

/**
 * Root composable. Swaps between the auth graph, the first-run onboarding graph
 * and the main graph based on the persisted session + onboarding flag
 * (PDF §3, Master Spec §C).
 *
 * Order of gates:
 *  1. No session  → Auth graph (login / sign-up).
 *  2. Session + onboarding not done → Onboarding graph (welcome, profile, perms).
 *  3. Session + onboarding done → Main graph (Home and everything else).
 */
@Composable
fun GagaApp(
    pendingDeepLink: String?,
    viewModel: AppViewModel = hiltViewModel(),
) {
    val session by viewModel.session.collectAsStateWithLifecycle()
    val onboardingCompleted by viewModel.onboardingCompleted.collectAsStateWithLifecycle()

    when {
        session == null -> AuthNavHost()

        // DataStore has not emitted yet — show a neutral splash frame.
        onboardingCompleted == null -> GagaLoading(modifier = Modifier.fillMaxSize())

        onboardingCompleted == false -> OnboardingNavHost(
            onFinished = { /* flag flip re-renders this composable into the main graph */ },
        )

        else -> MainNavHost(pendingDeepLink = pendingDeepLink)
    }
}
