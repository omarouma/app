package app.gagachat.feature.settings.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSecondaryButton
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaSettingsRow
import app.gagachat.core.ui.theme.GagaDimens
import java.util.Locale

/**
 * The in-app update screen. It shows the installed version, checks the trusted
 * registry for a newer build, and — the whole point of the feature — downloads
 * and installs it **without the user ever leaving GaGa**.
 *
 * The screen is reachable from Settings ("App update"), from the About screen,
 * and from the update notification's tap/action, so a user who taps "Update now"
 * lands exactly here.
 */
@Composable
fun AppUpdateScreen(
    onBack: () -> Unit,
    viewModel: AppUpdateViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // When the user returns from the "install unknown apps" settings page, the
    // capability may now be granted, so re-evaluate it.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) viewModel.refreshInstallPermission()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    GagaScaffold(title = "App update", onBack = onBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(vertical = GagaDimens.space8),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.SystemUpdate, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(GagaDimens.space12))
                Column {
                    Text("GaGa Chat", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        text = "Installed version ${state.installedVersionName.ifBlank { "\u2014" }}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            GagaDivider()

            when (state.phase) {
                UpdatePhase.CHECKING -> InfoBlock(
                    icon = Icons.Filled.Refresh,
                    title = "Checking for updates\u2026",
                    body = "Looking for the latest version of GaGa Chat.",
                )

                UpdatePhase.UP_TO_DATE -> {
                    InfoBlock(
                        icon = Icons.Filled.CheckCircle,
                        title = "You're up to date",
                        body = "GaGa Chat ${state.installedVersionName} is the latest version.",
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    ActionButton(text = "Check again", icon = Icons.Filled.Refresh) { viewModel.refresh(true) }
                }

                UpdatePhase.AVAILABLE -> {
                    val update = state.available
                    if (update != null) {
                        InfoBlock(
                            icon = Icons.Filled.SystemUpdate,
                            title = if (update.required) "Update required" else "Update available",
                            body = "GaGa Chat ${update.versionName} is ready to download.",
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        if (update.releaseNotes.isNotBlank()) {
                            GagaSectionHeader(text = "WHAT'S NEW")
                            Text(
                                text = update.releaseNotes,
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.padding(horizontal = GagaDimens.space16),
                            )
                        }
                        Spacer(Modifier.height(GagaDimens.space16))
                        if (!state.canInstall) {
                            Text(
                                text = "To install updates, allow GaGa to install unknown apps.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.padding(horizontal = GagaDimens.space16),
                            )
                            Spacer(Modifier.height(GagaDimens.space8))
                            GagaPrimaryButton(
                                text = "Allow installs",
                                modifier = Modifier.padding(horizontal = GagaDimens.space16),
                                onClick = {
                                    viewModel.installPermissionIntent()
                                        ?.let { intent -> runCatching { context.startActivity(intent) } }
                                },
                            )
                        } else {
                            GagaPrimaryButton(
                                text = "Download & install",
                                leadingIcon = Icons.Filled.Download,
                                modifier = Modifier.padding(horizontal = GagaDimens.space16),
                                onClick = viewModel::downloadAndInstall,
                            )
                        }
                    }
                }

                UpdatePhase.DOWNLOADING -> {
                    InfoBlock(
                        icon = Icons.Filled.Download,
                        title = "Downloading update\u2026",
                        body = progressLabel(state),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    LinearProgressIndicator(
                        progress = { state.progress ?: 0f },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = GagaDimens.space16),
                    )
                }

                UpdatePhase.READY, UpdatePhase.INSTALLING -> {
                    InfoBlock(
                        icon = Icons.Filled.CheckCircle,
                        title = "Ready to install",
                        body = "Follow the on-screen prompt to finish updating GaGa Chat.",
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    GagaSecondaryButton(
                        text = "Install again",
                        modifier = Modifier.padding(horizontal = GagaDimens.space16),
                        onClick = viewModel::downloadAndInstall,
                    )
                }

                UpdatePhase.ERROR -> {
                    InfoBlock(
                        icon = Icons.Filled.Warning,
                        title = "Update check failed",
                        body = state.message ?: "Something went wrong. Please try again.",
                        tint = MaterialTheme.colorScheme.error,
                    )
                    ActionButton(text = "Try again", icon = Icons.Filled.Refresh) { viewModel.refresh(true) }
                }
            }

            Spacer(Modifier.height(GagaDimens.space16))
            GagaSectionHeader(text = "AUTOMATIC UPDATES")
            GagaSettingsRow(
                title = "Check for updates automatically",
                subtitle = "GaGa notifies you when a new version is available",
                trailing = {
                    Switch(checked = state.autoCheck, onCheckedChange = viewModel::setAutoCheck)
                },
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Check for updates now",
                leadingIcon = Icons.Filled.Refresh,
                onClick = { viewModel.refresh(true) },
            )
            GagaDivider()
            Spacer(Modifier.height(GagaDimens.space32))
        }
    }
}

@Composable
private fun InfoBlock(
    icon: ImageVector,
    title: String,
    body: String,
    tint: Color = MaterialTheme.colorScheme.onSurfaceVariant,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space16),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(icon, contentDescription = null, tint = tint)
        Spacer(Modifier.width(GagaDimens.space12))
        Column(verticalArrangement = Arrangement.spacedBy(GagaDimens.space4)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ActionButton(text: String, icon: ImageVector, onClick: () -> Unit) {
    GagaSecondaryButton(
        text = text,
        leadingIcon = icon,
        modifier = Modifier.padding(horizontal = GagaDimens.space16),
        onClick = onClick,
    )
}

private fun progressLabel(state: AppUpdateUiState): String =
    if (state.totalBytes > 0L) {
        "${formatBytes(state.downloadedBytes)} of ${formatBytes(state.totalBytes)}"
    } else {
        "${formatBytes(state.downloadedBytes)} downloaded"
    }

private fun formatBytes(bytes: Long): String = when {
    bytes < 1024L -> "$bytes B"
    bytes < 1024L * 1024L -> String.format(Locale.US, "%.0f KB", bytes / 1024.0)
    else -> String.format(Locale.US, "%.1f MB", bytes / (1024.0 * 1024.0))
}
