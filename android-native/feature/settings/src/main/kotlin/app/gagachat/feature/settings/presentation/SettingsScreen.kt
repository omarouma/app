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
import androidx.compose.ui.Modifier
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
    onSignedOut: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

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
                onClick = onOpenProfile,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Edit profile",
                subtitle = "Name, username, bio, photo",
                leadingIcon = Icons.Filled.Edit,
                onClick = onOpenEditProfile,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Wallet",
                subtitle = "Coins and activity",
                leadingIcon = Icons.Filled.AccountBalanceWallet,
                onClick = onOpenWallet,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "My QR code",
                subtitle = "Let others add you instantly",
                leadingIcon = Icons.Filled.QrCode2,
                onClick = onOpenMyQr,
            )
            GagaDivider()

            GagaSectionHeader(text = "PREFERENCES")
            GagaSettingsRow(
                title = "App permissions",
                subtitle = "Camera, microphone, contacts and more",
                leadingIcon = Icons.Filled.Apps,
                onClick = onOpenNotifications,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Appearance",
                subtitle = "Theme: ${state.themeMode.name.lowercase().replaceFirstChar { it.uppercase() }}",
                leadingIcon = Icons.Filled.DarkMode,
                onClick = onOpenAppearance,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Notifications",
                subtitle = "Message and call alerts",
                leadingIcon = Icons.Filled.Notifications,
                onClick = onOpenNotifications,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Privacy",
                subtitle = "Read receipts, last seen, blocked users",
                leadingIcon = Icons.Filled.Lock,
                onClick = onOpenPrivacy,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Security",
                subtitle = "App lock, login and blocked users",
                leadingIcon = Icons.Filled.Security,
                onClick = onOpenPrivacy,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Data & Storage",
                subtitle = "Media auto-download and cache",
                leadingIcon = Icons.Filled.Storage,
                onClick = onOpenStorage,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Accessibility",
                subtitle = "Text size and display options",
                leadingIcon = Icons.Filled.Accessibility,
                onClick = onOpenAppearance,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Language",
                subtitle = "App display language",
                leadingIcon = Icons.Filled.Language,
                onClick = onOpenAppearance,
            )
            GagaDivider()

            GagaSectionHeader(text = "ABOUT")
            GagaSettingsRow(
                title = "Help",
                subtitle = "FAQs and support",
                leadingIcon = Icons.Filled.HelpOutline,
                onClick = onOpenAbout,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "About GaGa Chat",
                subtitle = "Version 2.0.0",
                leadingIcon = Icons.Filled.Info,
                onClick = onOpenAbout,
            )
            GagaDivider()

            Spacer(Modifier.height(GagaDimens.space16))
            GagaSettingsRow(
                title = "Sign out",
                leadingIcon = Icons.AutoMirrored.Filled.Logout,
                onClick = viewModel::signOut,
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
