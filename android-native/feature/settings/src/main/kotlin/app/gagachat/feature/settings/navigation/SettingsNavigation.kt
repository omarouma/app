package app.gagachat.feature.settings.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import app.gagachat.feature.settings.presentation.AboutSettingsScreen
import app.gagachat.feature.settings.presentation.AppearanceSettingsScreen
import app.gagachat.feature.settings.presentation.BlockedUsersScreen
import app.gagachat.feature.settings.presentation.EditProfileScreen
import app.gagachat.feature.settings.presentation.NotificationsSettingsScreen
import app.gagachat.feature.settings.presentation.PrivacySettingsScreen
import app.gagachat.feature.settings.presentation.SettingsRoute
import app.gagachat.feature.settings.presentation.StorageSettingsScreen

/** Routes for the full settings hub and every sub-screen (Master Spec §C). */
object SettingsRoutes {
    const val SETTINGS = "settings"
    const val EDIT_PROFILE = "settings/edit-profile"
    const val NOTIFICATIONS = "settings/notifications"
    const val PRIVACY = "settings/privacy"
    const val APPEARANCE = "settings/appearance"
    const val STORAGE = "settings/storage"
    const val BLOCKED = "settings/blocked"
    const val ABOUT = "settings/about"
}

/**
 * Registers the full settings graph. The hub ([SettingsRoute]) fans out to every
 * sub-surface; wallet and QR are owned by their own feature graphs and reached
 * through the [onOpenWallet] / [onOpenMyQr] callbacks so there is a single
 * source of truth for those routes.
 */
fun NavGraphBuilder.settingsScreen(
    navController: NavController,
    onOpenProfile: () -> Unit,
    onOpenWallet: () -> Unit,
    onOpenMyQr: () -> Unit,
    onSignedOut: () -> Unit,
) {
    composable(SettingsRoutes.SETTINGS) {
        SettingsRoute(
            onNavigateBack = { navController.popBackStack() },
            onOpenProfile = onOpenProfile,
            onOpenEditProfile = { navController.navigate(SettingsRoutes.EDIT_PROFILE) },
            onOpenWallet = onOpenWallet,
            onOpenMyQr = onOpenMyQr,
            onOpenNotifications = { navController.navigate(SettingsRoutes.NOTIFICATIONS) },
            onOpenPrivacy = { navController.navigate(SettingsRoutes.PRIVACY) },
            onOpenAppearance = { navController.navigate(SettingsRoutes.APPEARANCE) },
            onOpenStorage = { navController.navigate(SettingsRoutes.STORAGE) },
            onOpenBlocked = { navController.navigate(SettingsRoutes.BLOCKED) },
            onOpenAbout = { navController.navigate(SettingsRoutes.ABOUT) },
            onSignedOut = onSignedOut,
        )
    }
    composable(SettingsRoutes.EDIT_PROFILE) {
        EditProfileScreen(
            onBack = { navController.popBackStack() },
            onSaved = { navController.popBackStack() },
        )
    }
    composable(SettingsRoutes.NOTIFICATIONS) {
        NotificationsSettingsScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.PRIVACY) {
        PrivacySettingsScreen(
            onOpenBlocked = { navController.navigate(SettingsRoutes.BLOCKED) },
            onBack = { navController.popBackStack() },
        )
    }
    composable(SettingsRoutes.APPEARANCE) {
        AppearanceSettingsScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.STORAGE) {
        StorageSettingsScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.BLOCKED) {
        BlockedUsersScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.ABOUT) {
        AboutSettingsScreen(onBack = { navController.popBackStack() })
    }
}
