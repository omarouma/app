package app.gagachat.feature.settings.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaSettingsRow
import app.gagachat.core.ui.theme.GagaDimens

@Composable
fun SettingsRoute(
    onNavigateBack: () -> Unit,
    onOpenProfile: () -> Unit,
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

            GagaSectionHeader(text = "PREFERENCES")
            GagaSettingsRow(
                title = "Notifications",
                subtitle = "Message and call alerts",
                leadingIcon = Icons.Filled.Notifications,
                trailing = {
                    Switch(
                        checked = state.notificationsEnabled,
                        onCheckedChange = viewModel::setNotificationsEnabled,
                    )
                },
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Read receipts",
                subtitle = "Let others know when you've read messages",
                leadingIcon = Icons.Filled.Lock,
                trailing = {
                    Switch(
                        checked = state.readReceiptsEnabled,
                        onCheckedChange = viewModel::setReadReceiptsEnabled,
                    )
                },
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Appearance",
                subtitle = "Follow system theme",
                leadingIcon = Icons.Filled.DarkMode,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Storage and data",
                subtitle = "Manage cached media",
                leadingIcon = Icons.Filled.Storage,
            )
            GagaDivider()

            GagaSectionHeader(text = "ABOUT")
            GagaSettingsRow(
                title = "About GaGa Chat",
                subtitle = "Version 1.0.0",
                leadingIcon = Icons.Filled.Info,
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
