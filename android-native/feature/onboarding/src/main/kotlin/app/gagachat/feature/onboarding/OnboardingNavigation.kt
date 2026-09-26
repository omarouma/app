package app.gagachat.feature.onboarding

import androidx.compose.runtime.Composable
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

/** Routes for the post-authentication onboarding flow (Master Spec §C). */
object OnboardingRoutes {
    const val WELCOME = "onboarding/welcome"
    const val PROFILE = "onboarding/profile"
    const val PERMISSIONS = "onboarding/permissions"
}

/**
 * Self-contained onboarding graph: welcome → profile setup → permissions.
 *
 * One [OnboardingViewModel] is hoisted above the graph so every step shares the
 * same state. When the user finishes, [onFinished] is invoked and the app shell
 * swaps to the main graph.
 */
@Composable
fun OnboardingNavHost(onFinished: () -> Unit) {
    val navController = rememberNavController()
    val viewModel: OnboardingViewModel = hiltViewModel()

    NavHost(
        navController = navController,
        startDestination = OnboardingRoutes.WELCOME,
    ) {
        composable(OnboardingRoutes.WELCOME) {
            WelcomeScreen(
                onContinue = { navController.navigate(OnboardingRoutes.PROFILE) },
            )
        }
        composable(OnboardingRoutes.PROFILE) {
            ProfileSetupScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onContinue = { navController.navigate(OnboardingRoutes.PERMISSIONS) },
            )
        }
        composable(OnboardingRoutes.PERMISSIONS) {
            PermissionsScreen(
                onFinish = { viewModel.complete(onFinished) },
            )
        }
    }
}
