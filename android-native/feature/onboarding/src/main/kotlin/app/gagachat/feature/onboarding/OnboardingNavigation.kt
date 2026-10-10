package app.gagachat.feature.onboarding

import androidx.compose.runtime.Composable
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

/** Routes for the post-authentication onboarding flow (Master Spec §C). */
object OnboardingRoutes {
    const val PROFILE = "onboarding/profile"
    const val PRIVACY = "onboarding/privacy"
    const val PERMISSIONS = "onboarding/permissions"
    const val WELCOME = "onboarding/welcome"
}

/**
 * Self-contained onboarding graph (Master Spec §C — first-time experience):
 *
 *   Profile setup → Privacy preferences → App permissions → Welcome to GaGa!
 *
 * One [OnboardingViewModel] is hoisted above the graph so every step shares the
 * same state. When the user finishes, [onFinished] is invoked and the app shell
 * swaps to the main graph. Each step is independently skippable where the spec
 * allows (privacy and permissions are optional), so a new user can reach Home in
 * well under a minute.
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
                onContinue = { navController.navigate(OnboardingRoutes.PRIVACY) },
            )
        }
        composable(OnboardingRoutes.PRIVACY) {
            PrivacyPreferencesScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onContinue = { navController.navigate(OnboardingRoutes.PERMISSIONS) },
            )
        }
        composable(OnboardingRoutes.PERMISSIONS) {
            PermissionsScreen(
                onFinish = { navController.navigate(OnboardingRoutes.WELCOME) },
                onBack = { navController.popBackStack() },
            )
        }
        composable(OnboardingRoutes.WELCOME) {
            WelcomeCompleteScreen(
                onFinish = { viewModel.complete(onFinished) },
            )
        }
    }
}
