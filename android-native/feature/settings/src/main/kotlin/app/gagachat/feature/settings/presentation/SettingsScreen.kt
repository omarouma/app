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
    onOpenWallet: () -> Unit,
    onOpenMyQr: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenAppearance: () -> Unit,
    onOpenStorage: () -> Unit,
    onOpenBlocked: () -> Unit,
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
                leadingIconTint = IconBlue,
                onClick = onOpenEditProfile,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Wallet",
                subtitle = "Coins and activity",
                leadingIcon = Icons.Filled.AccountBalanceWallet,
                leadingIconTint = IconAmber,
                onClick = onOpenWallet,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "My QR code",
                subtitle = "Let others add you instantly",
                leadingIcon = Icons.Filled.QrCode2,
                leadingIconTint = IconPurple,
                onClick = onOpenMyQr,
            )
            GagaDivider()

            GagaSectionHeader(text = "PREFERENCES")
            GagaSettingsRow(
                title = "App permissions",
                subtitle = "Camera, microphone, contacts and more",
                leadingIcon = Icons.Filled.Apps,
                leadingIconTint = IconBlue,
                onClick = onOpenPermissions,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Appearance",
                subtitle = "Theme: ${state.themeMode.name.lowercase().replaceFirstChar { it.uppercase() }}",
                leadingIcon = Icons.Filled.DarkMode,
                leadingIconTint = IconPurple,
                onClick = onOpenAppearance,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Notifications",
                subtitle = "Message and call alerts",
                leadingIcon = Icons.Filled.Notifications,
                leadingIconTint = IconOrange,
                onClick = onOpenNotifications,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Privacy",
                subtitle = "Read receipts, last seen, blocked users",
                leadingIcon = Icons.Filled.Lock,
                leadingIconTint = IconTeal,
                onClick = onOpenPrivacy,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Security",
                subtitle = "App lock, login and blocked users",
                leadingIcon = Icons.Filled.Security,
                leadingIconTint = IconRed,
                onClick = onOpenSecurity,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Data & Storage",
                subtitle = "Media auto-download and cache",
                leadingIcon = Icons.Filled.Storage,
                leadingIconTint = IconIndigo,
                onClick = onOpenStorage,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Accessibility",
                subtitle = "Text size and display options",
                leadingIcon = Icons.Filled.Accessibility,
                leadingIconTint = IconCyan,
                onClick = onOpenAccessibility,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Language",
                subtitle = "App display language",
                leadingIcon = Icons.Filled.Language,
                leadingIconTint = IconGreen,
                onClick = onOpenLanguage,
            )
            GagaDivider()

            GagaSectionHeader(text = "ABOUT")
            GagaSettingsRow(
                title = "Help",
                subtitle = "FAQs and support",
                leadingIcon = Icons.Filled.HelpOutline,
                leadingIconTint = IconBlue,
                onClick = onOpenAbout,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "About GaGa Chat",
                subtitle = "Version $versionLabel",
                leadingIcon = Icons.Filled.Info,
                leadingIconTint = IconGrey,
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

private val IconGreen = Color(0xFF00A651)
private val IconBlue = Color(0xFF2F80ED)
private val IconPurple = Color(0xFF7E57C2)
private val IconOrange = Color(0xFFF2994A)
private val IconTeal = Color(0xFF26A69A)
private val IconRed = Color(0xFFEB5757)
private val IconIndigo = Color(0xFF5C6BC0)
private val IconCyan = Color(0xFF00ACC1)
private val IconAmber = Color(0xFFF2B705)
private val IconGrey = Color(0xFF8A94A6)
