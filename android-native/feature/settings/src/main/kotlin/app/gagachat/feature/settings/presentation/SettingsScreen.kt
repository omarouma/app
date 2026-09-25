package app.gagachat.feature.settings.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.QrCode2
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
 * Full settings hub (Master Spec §C — full settings). Groups every settings
 * surface: account/profile, wallet, QR, notifications, privacy, appearance,
 * storage, blocked users and about.
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
                title = "Appearance",
                subtitle = "Theme: ${state.themeMode.name.lowercase().replaceFirstChar { it.uppercase() }}",
                leadingIcon = Icons.Filled.DarkMode,
                onClick = onOpenAppearance,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Storage and data",
                subtitle = "Media auto-download and cache",
                leadingIcon = Icons.Filled.Storage,
                onClick = onOpenStorage,
            )
            GagaDivider()

            GagaSectionHeader(text = "ABOUT")
            GagaSettingsRow(
                title = "About GaGa Chat",
                subtitle = "Version 1.0.0",
                leadingIcon = Icons.Filled.Info,
                onClick = onOpenAbout,
            )
            GagaDivider()

            Spacer(Modifier.height(GagaDimens.space16))
            GagaSettingsRow(
                title = "Sign out",
                leadingIcon = Icons.Filled.Logout,
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
