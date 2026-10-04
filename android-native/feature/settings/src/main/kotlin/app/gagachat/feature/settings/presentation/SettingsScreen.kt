package app.gagachat.feature.settings.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Accessibility
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaSettingsRow
import app.gagachat.core.ui.theme.GagaDimens

/**
 * Full settings hub (Master Spec §C — full settings). Mirrors the reference
 * Settings screen (screenshot 174151): an account block followed by the
 * preference rows — App permissions, Appearance, Notifications, Privacy,
 * Security, Data & Storage, Accessibility, Language — and a Help entry.
 * Each row carries a distinct coloured leading icon, matching the reference.
 */
@Composable
fun SettingsRoute(
    onNavigateBack: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenEditProfile: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenAppearance: () -> Unit,
    onOpenStorage: () -> Unit,
    onOpenBlocked: () -> Unit,
    onOpenHelp: () -> Unit,
    onOpenAbout: () -> Unit,
    onOpenPermissions: () -> Unit,
    onOpenSecurity: () -> Unit,
    onOpenAccessibility: () -> Unit,
    onOpenLanguage: () -> Unit,
    onOpenDeleteAccount: () -> Unit,
    onSignedOut: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val versionLabel = remember { appVersionLabel(context) }

    LaunchedEffect(state.signedOut) {
        if (state.signedOut) onSignedOut()
    }

    GagaScaffold(title = "Settings", onBack = onNavigateBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            // Grouped exactly as agreed (spec §2). Every row leads to a working
            // screen — no dead entries. All non-destructive leading icons share
            // the one GaGa brand green; red is reserved for destructive actions.
            GagaSectionHeader(text = "ACCOUNT")
            GagaSettingsRow(
                title = state.displayName ?: "My profile",
                subtitle = state.email ?: state.phone,
                leadingIcon = Icons.Filled.AccountCircle,
                leadingIconTint = IconGreen,
                onClick = onOpenProfile,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Edit profile",
                subtitle = "Name, username, bio, photo",
                leadingIcon = Icons.Filled.Edit,
                leadingIconTint = IconGreen,
                onClick = onOpenEditProfile,
            )
            GagaDivider()

            GagaSectionHeader(text = "PRIVACY")
            GagaSettingsRow(
                title = "Privacy",
                subtitle = "Read receipts, last seen and blocked users",
                leadingIcon = Icons.Filled.Lock,
                leadingIconTint = IconGreen,
                onClick = onOpenPrivacy,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Blocked users",
                subtitle = "People you've blocked",
                leadingIcon = Icons.Filled.Block,
                leadingIconTint = IconGreen,
                onClick = onOpenBlocked,
            )
            GagaDivider()

            GagaSectionHeader(text = "SECURITY")
            GagaSettingsRow(
                title = "Security",
                subtitle = "App lock and account protection",
                leadingIcon = Icons.Filled.Security,
                leadingIconTint = IconGreen,
                onClick = onOpenSecurity,
            )
            GagaDivider()

            GagaSectionHeader(text = "NOTIFICATIONS & SOUNDS")
            GagaSettingsRow(
                title = "Notifications",
                subtitle = "Messages, groups, calls, previews, sound & vibration",
                leadingIcon = Icons.Filled.Notifications,
                leadingIconTint = IconGreen,
                onClick = onOpenNotifications,
            )
            GagaDivider()

            GagaSectionHeader(text = "DATA & STORAGE")
            GagaSettingsRow(
                title = "Data & Storage",
                subtitle = "Auto-download, upload quality, storage management",
                leadingIcon = Icons.Filled.Storage,
                leadingIconTint = IconGreen,
                onClick = onOpenStorage,
            )
            GagaDivider()

            GagaSectionHeader(text = "APPEARANCE")
            GagaSettingsRow(
                title = "Appearance",
                subtitle = "Theme: ${state.themeMode.name.lowercase().replaceFirstChar { it.uppercase() }}",
                leadingIcon = Icons.Filled.DarkMode,
                leadingIconTint = IconGreen,
                onClick = onOpenAppearance,
            )
            GagaDivider()

            GagaSectionHeader(text = "LANGUAGE & ACCESSIBILITY")
            GagaSettingsRow(
                title = "Language",
                subtitle = "App display language",
                leadingIcon = Icons.Filled.Language,
                leadingIconTint = IconGreen,
                onClick = onOpenLanguage,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Accessibility",
                subtitle = "Text size and display options",
                leadingIcon = Icons.Filled.Accessibility,
                leadingIconTint = IconGreen,
                onClick = onOpenAccessibility,
            )
            GagaDivider()

            GagaSectionHeader(text = "PERMISSIONS")
            GagaSettingsRow(
                title = "App permissions",
                subtitle = "Camera, microphone, contacts, media and more",
                leadingIcon = Icons.Filled.Apps,
                leadingIconTint = IconGreen,
                onClick = onOpenPermissions,
            )
            GagaDivider()

            GagaSectionHeader(text = "HELP & ABOUT")
            GagaSettingsRow(
                title = "Help & Support",
                subtitle = "FAQs and contact support",
                leadingIcon = Icons.Filled.HelpOutline,
                leadingIconTint = IconGreen,
                onClick = onOpenHelp,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "About GaGa Chat",
                subtitle = "Version $versionLabel",
                leadingIcon = Icons.Filled.Info,
                leadingIconTint = IconGreen,
                onClick = onOpenAbout,
            )
            GagaDivider()

            Spacer(Modifier.height(GagaDimens.space16))
            GagaSettingsRow(
                title = "Sign out",
                leadingIcon = Icons.AutoMirrored.Filled.Logout,
                leadingIconTint = IconRed,
                onClick = viewModel::signOut,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Delete account",
                subtitle = "Permanently remove your account and data",
                leadingIcon = Icons.Filled.DeleteForever,
                leadingIconTint = IconRed,
                onClick = onOpenDeleteAccount,
            )
            Spacer(Modifier.height(GagaDimens.space48))
            Text(
                text = "GaGa Chat",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = GagaDimens.space16),
            )
        }
    }
}

// Single brand green for every non-destructive leading icon (spec §1: one GaGa
// primary green). Red (IconRed) is reserved for destructive actions only.
private val IconGreen = Color(0xFF00C300)
private val IconBlue = Color(0xFF2F80ED)
private val IconPurple = Color(0xFF7E57C2)
private val IconOrange = Color(0xFFF2994A)
private val IconTeal = Color(0xFF26A69A)
private val IconRed = Color(0xFFEB5757)
private val IconIndigo = Color(0xFF5C6BC0)
private val IconCyan = Color(0xFF00ACC1)
private val IconAmber = Color(0xFFF2B705)
private val IconGrey = Color(0xFF8A94A6)
