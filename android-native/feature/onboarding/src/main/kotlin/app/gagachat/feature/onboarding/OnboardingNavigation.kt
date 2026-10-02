package app.gagachat.feature.onboarding

import androidx.compose.runtime.Composable
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

/** Routes for the post-authentication onboarding flow (Master Spec §C). */
object OnboardingRoutes {
    const val PROFILE = "onboarding/profile"
    const val PERMISSIONS = "onboarding/permissions"
}

/**
 * Self-contained onboarding graph: profile setup → permissions.
 *
 * The standalone Welcome/marketing screen was removed — a freshly authenticated
 * user lands straight on profile setup, which is the first step that actually
 * collects something. One [OnboardingViewModel] is hoisted above the graph so
 * every step shares the same state. When the user finishes, [onFinished] is
 * invoked and the app shell swaps to the main graph.
 */
@Composable
fun OnboardingNavHost(onFinished: () -> Unit) {
    val navController = rememberNavController()
    val viewModel: OnboardingViewModel = hiltViewModel()

    NavHost(
        navController = navController,
        startDestination = OnboardingRoutes.PROFILE,
    ) {
        composable(OnboardingRoutes.PROFILE) {
            ProfileSetupScreen(
                viewModel = viewModel,
                // First screen in the graph — there is nothing to go back to.
                onBack = {},
                onContinue = { navController.navigate(OnboardingRoutes.PERMISSIONS) },
            )
        }
        composable(OnboardingRoutes.PERMISSIONS) {
            PermissionsScreen(
                onFinish = { viewModel.complete(onFinished) },
                onBack = { navController.popBackStack() },
            )
        }
    }
}
