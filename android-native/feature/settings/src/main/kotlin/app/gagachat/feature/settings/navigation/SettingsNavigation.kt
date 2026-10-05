package app.gagachat.feature.settings.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import app.gagachat.feature.settings.presentation.AboutSettingsScreen
import app.gagachat.feature.settings.presentation.AccessibilitySettingsScreen
import app.gagachat.feature.settings.presentation.AppPermissionsScreen
import app.gagachat.feature.settings.presentation.AppearanceSettingsScreen
import app.gagachat.feature.settings.presentation.BlockedUsersScreen
import app.gagachat.feature.settings.presentation.DeleteAccountSettingsScreen
import app.gagachat.feature.settings.presentation.EditProfileScreen
import app.gagachat.feature.settings.presentation.HelpSupportScreen
import app.gagachat.feature.settings.presentation.LanguageSettingsScreen
import app.gagachat.feature.settings.presentation.NotificationInboxScreen
import app.gagachat.feature.settings.presentation.NotificationsSettingsScreen
import app.gagachat.feature.settings.presentation.PrivacySettingsScreen
import app.gagachat.feature.settings.presentation.SavedMessagesScreen
import app.gagachat.feature.settings.presentation.SecuritySettingsScreen
import app.gagachat.feature.settings.presentation.SettingsRoute
import app.gagachat.feature.settings.presentation.StorageSettingsScreen

/** Routes for the full settings hub and every sub-screen (Master Spec §C). */
object SettingsRoutes {
    const val SETTINGS = "settings"
    const val EDIT_PROFILE = "settings/edit-profile"
    const val NOTIFICATIONS = "settings/notifications"
    const val NOTIFICATIONS_INBOX = "settings/notifications-inbox"
    const val SAVED_MESSAGES = "settings/saved-messages"
    const val PRIVACY = "settings/privacy"
    const val APPEARANCE = "settings/appearance"
    const val STORAGE = "settings/storage"
    const val BLOCKED = "settings/blocked"
    const val HELP = "settings/help"
    const val ABOUT = "settings/about"
    const val PERMISSIONS = "settings/permissions"
    const val SECURITY = "settings/security"
    const val ACCESSIBILITY = "settings/accessibility"
    const val LANGUAGE = "settings/language"
    const val DELETE_ACCOUNT = "settings/delete-account"
}

/**
 * Registers the full settings graph. The hub ([SettingsRoute]) fans out to every
 * sub-surface, including the Help & Support screen ([SettingsRoutes.HELP]). The
 * profile route is owned by the profile feature graph and reached through
 * [onOpenProfile] so there is a single source of truth for it.
 */
fun NavGraphBuilder.settingsScreen(
    navController: NavController,
    onOpenProfile: () -> Unit,
    onSignedOut: () -> Unit,
    onOpenRequests: () -> Unit = {},
) {
    composable(SettingsRoutes.SETTINGS) {
        SettingsRoute(
            onNavigateBack = { navController.popBackStack() },
            onOpenProfile = onOpenProfile,
            onOpenEditProfile = { navController.navigate(SettingsRoutes.EDIT_PROFILE) },
            onOpenNotifications = { navController.navigate(SettingsRoutes.NOTIFICATIONS) },
            onOpenPrivacy = { navController.navigate(SettingsRoutes.PRIVACY) },
            onOpenAppearance = { navController.navigate(SettingsRoutes.APPEARANCE) },
            onOpenStorage = { navController.navigate(SettingsRoutes.STORAGE) },
            onOpenBlocked = { navController.navigate(SettingsRoutes.BLOCKED) },
            onOpenHelp = { navController.navigate(SettingsRoutes.HELP) },
            onOpenAbout = { navController.navigate(SettingsRoutes.ABOUT) },
            onOpenPermissions = { navController.navigate(SettingsRoutes.PERMISSIONS) },
            onOpenSecurity = { navController.navigate(SettingsRoutes.SECURITY) },
            onOpenAccessibility = { navController.navigate(SettingsRoutes.ACCESSIBILITY) },
            onOpenLanguage = { navController.navigate(SettingsRoutes.LANGUAGE) },
            onOpenDeleteAccount = { navController.navigate(SettingsRoutes.DELETE_ACCOUNT) },
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
    composable(SettingsRoutes.NOTIFICATIONS_INBOX) {
        NotificationInboxScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.SAVED_MESSAGES) {
        SavedMessagesScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.PRIVACY) {
        PrivacySettingsScreen(
            onOpenBlocked = { navController.navigate(SettingsRoutes.BLOCKED) },
            onOpenRequests = onOpenRequests,
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
    composable(SettingsRoutes.HELP) {
        HelpSupportScreen(
            onBack = { navController.popBackStack() },
            onOpenPermissions = { navController.navigate(SettingsRoutes.PERMISSIONS) },
            onOpenAbout = { navController.navigate(SettingsRoutes.ABOUT) },
        )
    }
    composable(SettingsRoutes.PERMISSIONS) {
        AppPermissionsScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.SECURITY) {
        SecuritySettingsScreen(
            onOpenBlocked = { navController.navigate(SettingsRoutes.BLOCKED) },
            onBack = { navController.popBackStack() },
        )
    }
    composable(SettingsRoutes.ACCESSIBILITY) {
        AccessibilitySettingsScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.LANGUAGE) {
        LanguageSettingsScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.DELETE_ACCOUNT) {
        DeleteAccountSettingsScreen(
            onBack = { navController.popBackStack() },
            onDeleted = onSignedOut,
        )
    }
}
