package app.gagachat.feature.auth.navigation

import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import app.gagachat.feature.auth.presentation.intro.IntroductionRoute
import app.gagachat.feature.auth.presentation.login.LoginRoute
import app.gagachat.feature.auth.presentation.otp.OtpRoute
import app.gagachat.feature.auth.presentation.register.RegisterRoute
import app.gagachat.feature.auth.presentation.splash.SplashRoute
import app.gagachat.feature.auth.presentation.welcome.WelcomeRoute
import app.gagachat.feature.auth.presentation.welcome.WelcomeViewModel

/**
 * Auth feature navigation graph. The app shell hosts this graph and observes the
 * session state to decide when to swap to the main graph (PDF §3 — direct Home
 * startup once a valid session exists).
 *
 * Startup order (Master Spec §C):
 *   Splash (check auth) → Welcome (first run only) → Introduction (skippable)
 *   → Sign Up / Log In → Account Verification (OTP).
 */
object AuthRoutes {
    const val SPLASH = "auth/splash"
    const val WELCOME = "auth/welcome"
    const val INTRO = "auth/intro"
    const val LOGIN = "auth/login"
    const val REGISTER = "auth/register"
    const val OTP = "auth/otp?identifier={identifier}&channel={channel}"

    fun otp(identifier: String, channel: String): String =
        "auth/otp?identifier=${java.net.URLEncoder.encode(identifier, "UTF-8")}&channel=$channel"
}

fun NavGraphBuilder.authGraph(
    navController: NavController,
    onAuthenticated: () -> Unit,
) {
    composable(AuthRoutes.SPLASH) {
        SplashRoute(
            onAuthenticated = onAuthenticated,
            onNeedsWelcome = {
                navController.navigate(AuthRoutes.WELCOME) {
                    popUpTo(AuthRoutes.SPLASH) { inclusive = true }
                }
            },
            onNeedsLogin = {
                navController.navigate(AuthRoutes.LOGIN) {
                    popUpTo(AuthRoutes.SPLASH) { inclusive = true }
                }
            },
        )
    }
    composable(AuthRoutes.WELCOME) {
        val viewModel: WelcomeViewModel = hiltViewModel()
        WelcomeRoute(
            onGetStarted = {
                viewModel.onWelcomeShown()
                navController.navigate(AuthRoutes.INTRO)
            },
            onSignIn = {
                viewModel.onIntroPassed()
                navController.navigate(AuthRoutes.LOGIN) {
                    popUpTo(AuthRoutes.WELCOME) { inclusive = true }
                }
            },
        )
    }
    composable(AuthRoutes.INTRO) {
        val viewModel: WelcomeViewModel = hiltViewModel()
        IntroductionRoute(
            onFinish = {
                viewModel.onIntroPassed()
                navController.navigate(AuthRoutes.REGISTER) {
                    popUpTo(AuthRoutes.WELCOME) { inclusive = true }
                }
            },
            onSkip = {
                viewModel.onIntroPassed()
                navController.navigate(AuthRoutes.LOGIN) {
                    popUpTo(AuthRoutes.WELCOME) { inclusive = true }
                }
            },
            onSignIn = {
                viewModel.onIntroPassed()
                navController.navigate(AuthRoutes.LOGIN) {
                    popUpTo(AuthRoutes.WELCOME) { inclusive = true }
                }
            },
        )
    }
    composable(AuthRoutes.LOGIN) {
        LoginRoute(
            onAuthenticated = onAuthenticated,
            onNavigateToRegister = { navController.navigate(AuthRoutes.REGISTER) },
            onNavigateToOtp = { identifier, channel ->
                navController.navigate(AuthRoutes.otp(identifier, channel))
            },
        )
    }
    composable(AuthRoutes.REGISTER) {
        RegisterRoute(
            onAuthenticated = onAuthenticated,
            onNavigateBack = { navController.popBackStack() },
            onNavigateToOtp = { identifier, channel ->
                navController.navigate(AuthRoutes.otp(identifier, channel))
            },
        )
    }
    composable(AuthRoutes.OTP) { backStackEntry ->
        val identifier = backStackEntry.arguments?.getString("identifier").orEmpty()
        val channel = backStackEntry.arguments?.getString("channel") ?: "email"
        OtpRoute(
            identifier = identifier,
            channel = channel,
            onAuthenticated = onAuthenticated,
            onNavigateBack = { navController.popBackStack() },
        )
    }
}
