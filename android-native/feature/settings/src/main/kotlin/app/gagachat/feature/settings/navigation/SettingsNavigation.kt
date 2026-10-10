package app.gagachat.feature.settings.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import app.gagachat.core.model.NotificationTarget
import app.gagachat.core.model.target
import app.gagachat.feature.settings.presentation.AboutSettingsScreen
import app.gagachat.feature.settings.presentation.AccessibilitySettingsScreen
import app.gagachat.feature.settings.presentation.AdvancedTroubleshootingSettingsScreen
import app.gagachat.feature.settings.presentation.AiAssistantSettingsScreen
import app.gagachat.feature.settings.presentation.AntiSpamTrustSettingsScreen
import app.gagachat.feature.settings.presentation.AppPermissionsScreen
import app.gagachat.feature.settings.presentation.AppearanceSettingsScreen
import app.gagachat.feature.settings.presentation.BackupRestoreSettingsScreen
import app.gagachat.feature.settings.presentation.BlockedUsersScreen
import app.gagachat.feature.settings.presentation.BusinessTeamSettingsScreen
import app.gagachat.feature.settings.presentation.CallsSettingsScreen
import app.gagachat.feature.settings.presentation.ChatsMessagingSettingsScreen
import app.gagachat.feature.settings.presentation.DailyRoutinesSettingsScreen
import app.gagachat.feature.settings.presentation.DeleteAccountSettingsScreen
import app.gagachat.feature.settings.presentation.DeliveryServicesSettingsScreen
import app.gagachat.feature.settings.presentation.EditProfileScreen
import app.gagachat.feature.settings.presentation.HelpSupportScreen
import app.gagachat.feature.settings.presentation.LanguageSettingsScreen
import app.gagachat.feature.settings.presentation.MultiDeviceSettingsScreen
import app.gagachat.feature.settings.presentation.NetworkPerformanceSettingsScreen
import app.gagachat.feature.settings.presentation.NotificationInboxScreen
import app.gagachat.feature.settings.presentation.NotificationsSettingsScreen
import app.gagachat.feature.settings.presentation.PeopleContactsSettingsScreen
import app.gagachat.feature.settings.presentation.PersonalDashboardSettingsScreen
import app.gagachat.feature.settings.presentation.PremiumSettingsScreen
import app.gagachat.feature.settings.presentation.PrivacySettingsScreen
import app.gagachat.feature.settings.presentation.SafeLocationSettingsScreen
import app.gagachat.feature.settings.presentation.SavedMessagesScreen
import app.gagachat.feature.settings.presentation.SearchDiscoverySettingsScreen
import app.gagachat.feature.settings.presentation.SecuritySettingsScreen
import app.gagachat.feature.settings.presentation.SettingsRoute
import app.gagachat.feature.settings.presentation.StorageSettingsScreen
import app.gagachat.feature.settings.presentation.WidgetsShortcutsSettingsScreen

/** Routes for the full settings hub and every sub-screen (Master Spec §C; Settings Center V2.0). */
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

    // Settings Center V2.0 — categories 4, 9 and 16–30.
    const val TRUST = "settings/trust"
    const val SAFE = "settings/safe"
    const val CHATS = "settings/chats"
    const val CALLS = "settings/calls"
    const val SEARCH = "settings/search"
    const val ROUTINES = "settings/routines"
    const val AI = "settings/ai"
    const val DASHBOARD = "settings/dashboard"
    const val PEOPLE_CONTACTS = "settings/people-contacts"
    const val NETWORK = "settings/network"
    const val DEVICES = "settings/devices"
    const val BACKUP = "settings/backup"
    const val WIDGETS = "settings/widgets"
    const val TROUBLESHOOT = "settings/troubleshoot"
    const val BUSINESS = "settings/business"
    const val PREMIUM = "settings/premium"
    const val DELIVERY = "settings/delivery"
}

/**
 * Registers the full settings graph. The hub ([SettingsRoute]) fans out to every
 * sub-surface. The profile route is owned by the profile feature graph and
 * reached through [onOpenProfile] so there is a single source of truth for it.
 */
fun NavGraphBuilder.settingsScreen(
    navController: NavController,
    onOpenProfile: () -> Unit,
    onSignedOut: () -> Unit,
    onOpenChat: (String) -> Unit,
    onOpenPeople: () -> Unit,
    onOpenCalls: () -> Unit,
) {
    composable(SettingsRoutes.SETTINGS) {
        SettingsRoute(
            onNavigateBack = { navController.popBackStack() },
            onOpenProfile = onOpenProfile,
            onNavigate = { route -> navController.navigate(route) },
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
        NotificationInboxScreen(onBack = { navController.popBackStack() }, onOpenNotification = { notification ->
            when (val target = notification.target()) {
                is NotificationTarget.Chat -> onOpenChat(target.id)
                NotificationTarget.People -> onOpenPeople()
                NotificationTarget.Calls -> onOpenCalls()
                null -> Unit
            }
        })
    }
    composable(SettingsRoutes.SAVED_MESSAGES) {
        SavedMessagesScreen(onBack = { navController.popBackStack() }, onOpenChat = onOpenChat)
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

    // ---- Settings Center V2.0 (categories 4, 9, 16–30) ----
    composable(SettingsRoutes.PEOPLE_CONTACTS) {
        PeopleContactsSettingsScreen(
            onBack = { navController.popBackStack() },
            onOpenBlocked = { navController.navigate(SettingsRoutes.BLOCKED) },
        )
    }
    composable(SettingsRoutes.SEARCH) {
        SearchDiscoverySettingsScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.ROUTINES) {
        DailyRoutinesSettingsScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.AI) {
        AiAssistantSettingsScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.SAFE) {
        SafeLocationSettingsScreen(
            onBack = { navController.popBackStack() },
            onOpenPermissions = { navController.navigate(SettingsRoutes.PERMISSIONS) },
        )
    }
    composable(SettingsRoutes.DEVICES) {
        MultiDeviceSettingsScreen(
            onBack = { navController.popBackStack() },
            onOpenSecurity = { navController.navigate(SettingsRoutes.SECURITY) },
        )
    }
    composable(SettingsRoutes.BACKUP) {
        BackupRestoreSettingsScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.NETWORK) {
        NetworkPerformanceSettingsScreen(
            onBack = { navController.popBackStack() },
            onOpenStorage = { navController.navigate(SettingsRoutes.STORAGE) },
            onOpenPermissions = { navController.navigate(SettingsRoutes.PERMISSIONS) },
        )
    }
    composable(SettingsRoutes.WIDGETS) {
        WidgetsShortcutsSettingsScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.TRUST) {
        AntiSpamTrustSettingsScreen(
            onBack = { navController.popBackStack() },
            onOpenBlocked = { navController.navigate(SettingsRoutes.BLOCKED) },
        )
    }
    composable(SettingsRoutes.DASHBOARD) {
        PersonalDashboardSettingsScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.TROUBLESHOOT) {
        AdvancedTroubleshootingSettingsScreen(
            onBack = { navController.popBackStack() },
            onOpenPermissions = { navController.navigate(SettingsRoutes.PERMISSIONS) },
            onOpenHelp = { navController.navigate(SettingsRoutes.HELP) },
        )
    }
    composable(SettingsRoutes.CHATS) {
        ChatsMessagingSettingsScreen(
            onBack = { navController.popBackStack() },
            onOpenPrivacy = { navController.navigate(SettingsRoutes.PRIVACY) },
            onOpenStorage = { navController.navigate(SettingsRoutes.STORAGE) },
            onOpenAppearance = { navController.navigate(SettingsRoutes.APPEARANCE) },
        )
    }
    composable(SettingsRoutes.CALLS) {
        CallsSettingsScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.BUSINESS) {
        BusinessTeamSettingsScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.PREMIUM) {
        PremiumSettingsScreen(onBack = { navController.popBackStack() })
    }
    composable(SettingsRoutes.DELIVERY) {
        DeliveryServicesSettingsScreen(onBack = { navController.popBackStack() })
    }
}
