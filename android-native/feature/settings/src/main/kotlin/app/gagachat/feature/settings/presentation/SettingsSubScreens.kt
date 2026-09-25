package app.gagachat.feature.settings.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.data.preferences.MediaDownloadPolicy
import app.gagachat.core.data.preferences.ThemeMode
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaSettingsRow
import app.gagachat.core.ui.theme.GagaDimens

/** Notifications settings (Master Spec §C). */
@Composable
fun NotificationsSettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Notifications", onBack = onBack) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            GagaSettingsRow(
                title = "Message notifications",
                subtitle = "Alerts for new messages",
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
                title = "Message sounds",
                subtitle = "Play a sound for new messages",
                trailing = {
                    Switch(
                        checked = state.messageSoundsEnabled,
                        onCheckedChange = viewModel::setMessageSoundsEnabled,
                    )
                },
            )
            GagaDivider()
        }
    }
}

/** Privacy settings (Master Spec §C). */
@Composable
fun PrivacySettingsScreen(
    onOpenBlocked: () -> Unit,
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Privacy", onBack = onBack) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            GagaSettingsRow(
                title = "Read receipts",
                subtitle = "Let others know when you've read messages",
                trailing = {
                    Switch(
                        checked = state.readReceiptsEnabled,
                        onCheckedChange = viewModel::setReadReceiptsEnabled,
                    )
                },
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Share last seen",
                subtitle = "Show when you were last online",
                trailing = {
                    Switch(
                        checked = state.shareLastSeenEnabled,
                        onCheckedChange = viewModel::setShareLastSeenEnabled,
                    )
                },
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Blocked users",
                subtitle = "People you've blocked",
                leadingIcon = Icons.Filled.Lock,
                onClick = onOpenBlocked,
            )
            GagaDivider()
        }
    }
}

/** Appearance settings (Master Spec §C). */
@Composable
fun AppearanceSettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Appearance", onBack = onBack) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            GagaSectionHeader("THEME")
            ThemeMode.entries.forEach { mode ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectable(
                            selected = state.themeMode == mode,
                            onClick = { viewModel.setThemeMode(mode) },
                        )
                        .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space12),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(
                        selected = state.themeMode == mode,
                        onClick = { viewModel.setThemeMode(mode) },
                    )
                    Spacer(Modifier.width(GagaDimens.space8))
                    Text(
                        text = mode.name.lowercase().replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            }
        }
    }
}

/** Storage & data settings (Master Spec §C). */
@Composable
fun StorageSettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Storage and data", onBack = onBack) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            GagaSettingsRow(
                title = "Auto-download media",
                subtitle = "Automatically download photos and videos",
                leadingIcon = Icons.Filled.Storage,
                trailing = {
                    Switch(
                        checked = state.autoDownloadEnabled,
                        onCheckedChange = viewModel::setAutoDownloadEnabled,
                    )
                },
            )
            GagaDivider()
            GagaSectionHeader("WHEN TO AUTO-DOWNLOAD")
            MediaDownloadPolicy.entries.forEach { policy ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectable(
                            selected = state.mediaPolicy == policy,
                            onClick = { viewModel.setMediaPolicy(policy) },
                        )
                        .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space12),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(
                        selected = state.mediaPolicy == policy,
                        onClick = { viewModel.setMediaPolicy(policy) },
                    )
                    Spacer(Modifier.width(GagaDimens.space8))
                    Text(
                        text = when (policy) {
                            MediaDownloadPolicy.ALWAYS -> "Always"
                            MediaDownloadPolicy.WIFI -> "Wi-Fi only"
                            MediaDownloadPolicy.NEVER -> "Never"
                        },
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            }
            GagaDivider()
            GagaSettingsRow(
                title = "Clear media cache",
                subtitle = "Free up space used by downloaded media",
                leadingIcon = Icons.Filled.DeleteSweep,
                onClick = { /* cache clearing handled by the media layer */ },
            )
            GagaDivider()
        }
    }
}

/** About screen (Master Spec §C). */
@Composable
fun AboutSettingsScreen(onBack: () -> Unit) {
    GagaScaffold(title = "About", onBack = onBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(GagaDimens.space16),
        ) {
            Icon(
                Icons.Filled.Info,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(GagaDimens.space12))
            Text(text = "GaGa Chat", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(GagaDimens.space4))
            Text(
                text = "Version 1.1.0",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(GagaDimens.space16))
            Text(
                text = "GaGa Chat is a fast, private messenger. Messages sync across " +
                    "your devices, media is cached locally for instant loading, and " +
                    "calls use end-to-end encrypted WebRTC.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(GagaDimens.space16))
            GagaSettingsRow(
                title = "Terms of service",
                leadingIcon = Icons.Filled.Check,
                onClick = { },
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Privacy policy",
                leadingIcon = Icons.Filled.Lock,
                onClick = { },
            )
            GagaDivider()
        }
    }
}
