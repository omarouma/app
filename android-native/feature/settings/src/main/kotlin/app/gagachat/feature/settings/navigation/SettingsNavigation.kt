package app.gagachat.feature.settings.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import app.gagachat.feature.settings.presentation.SettingsRoute

object SettingsRoutes {
    const val SETTINGS = "settings"
}

fun NavGraphBuilder.settingsScreen(
    navController: NavController,
    onOpenProfile: () -> Unit,
    onSignedOut: () -> Unit,
) {
    composable(SettingsRoutes.SETTINGS) {
        SettingsRoute(
            onNavigateBack = { navController.popBackStack() },
            onOpenProfile = onOpenProfile,
            onSignedOut = onSignedOut,
        )
    }
}
