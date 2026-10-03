package app.gagachat.feature.settings.presentation

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material.icons.filled.Accessibility
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Contacts
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.Icon
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.data.preferences.AppLanguage
import app.gagachat.core.data.preferences.MediaDownloadPolicy
import app.gagachat.core.data.preferences.TextScale
import app.gagachat.core.data.preferences.ThemeMode
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaPrimaryButton
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
    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(Unit) {
        viewModel.notices.collect { snackbarHostState.showSnackbar(it) }
    }
    GagaScaffold(
        title = "Storage and data",
        onBack = onBack,
        snackbarHostState = snackbarHostState,
    ) { padding ->
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
            val cacheLabel = state.cacheSizeLabel
            GagaSettingsRow(
                title = "Clear media cache",
                subtitle = if (cacheLabel != null) {
                    "Currently using $cacheLabel - tap to free up space"
                } else {
                    "Free up space used by downloaded media"
                },
                leadingIcon = Icons.Filled.DeleteSweep,
                onClick = viewModel::clearMediaCache,
            )
            GagaDivider()
        }
    }
}

/** About screen (Master Spec §C). */
@Composable
fun AboutSettingsScreen(onBack: () -> Unit) {
    val uriHandler = LocalUriHandler.current
    val context = LocalContext.current
    val versionLabel = remember { appVersionLabel(context) }
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
                text = "Version $versionLabel",
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
                onClick = { runCatching { uriHandler.openUri(TERMS_URL) } },
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Privacy policy",
                leadingIcon = Icons.Filled.Lock,
                onClick = { runCatching { uriHandler.openUri(PRIVACY_URL) } },
            )
            GagaDivider()
        }
    }
}

/**
 * App permissions (Master Spec §C). Shows the runtime status for each capability
 * GaGa uses and lets the user grant them or open system settings.
 */
@Composable
fun AppPermissionsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    var refreshTick by remember { mutableStateOf(0) }
    val items = remember {
        listOf(
            PermissionItem(
                "Notifications",
                "Message and call alerts",
                notificationPermissions(),
                Icons.Filled.NotificationsActive,
            ),
            PermissionItem(
                "Camera",
                "Video calls and QR scanning",
                listOf(Manifest.permission.CAMERA),
                Icons.Filled.CameraAlt,
            ),
            PermissionItem(
                "Microphone",
                "Voice messages and calls",
                listOf(Manifest.permission.RECORD_AUDIO),
                Icons.Filled.Mic,
            ),
            PermissionItem(
                "Contacts",
                "Find friends already on GaGa",
                listOf(Manifest.permission.READ_CONTACTS),
                Icons.Filled.Contacts,
            ),
            PermissionItem(
                "Photos & media",
                "Send and save photos and videos",
                mediaPermissions(),
                Icons.Filled.PhotoLibrary,
            ),
            PermissionItem(
                "Location",
                "Share your location in chats",
                listOf(Manifest.permission.ACCESS_FINE_LOCATION),
                Icons.Filled.LocationOn,
            ),
        )
    }
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { refreshTick++ }

    GagaScaffold(title = "App permissions", onBack = onBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            Text(
                text = "Control what GaGa Chat can access. Tap a permission to grant it.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(GagaDimens.space16),
            )
            items.forEach { item ->
                val granted = refreshTick.let { item.isGranted(context) }
                GagaSettingsRow(
                    title = item.label,
                    subtitle = if (granted) "Granted" else item.description,
                    leadingIcon = item.icon,
                    onClick = { launcher.launch(item.permissions.toTypedArray()) },
                    trailing = {
                        Icon(
                            imageVector = if (granted) Icons.Filled.CheckCircle else Icons.Filled.Close,
                            contentDescription = if (granted) "Granted" else "Not granted",
                            tint = if (granted) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.error,
                        )
                    },
                )
                GagaDivider()
            }
            Spacer(Modifier.height(GagaDimens.space16))
            GagaPrimaryButton(
                text = "Open app settings",
                onClick = {
                    val intent = Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.fromParts("package", context.packageName, null),
                    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    runCatching { context.startActivity(intent) }
                },
                leadingIcon = Icons.Filled.OpenInNew,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space16),
            )
            Spacer(Modifier.height(GagaDimens.space32))
        }
    }
}

private data class PermissionItem(
    val label: String,
    val description: String,
    val permissions: List<String>,
    val icon: ImageVector,
) {
    fun isGranted(context: Context): Boolean = permissions.all {
        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }
}

private fun notificationPermissions(): List<String> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        listOf(Manifest.permission.POST_NOTIFICATIONS)
    } else {
        emptyList()
    }

private fun mediaPermissions(): List<String> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        buildList {
            add(Manifest.permission.READ_MEDIA_IMAGES)
            add(Manifest.permission.READ_MEDIA_VIDEO)
            // Android 14+ lets users grant partial ("Select photos") access.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                add(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
            }
        }
    } else {
        listOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }

/** Security settings (Master Spec §C). */
@Composable
fun SecuritySettingsScreen(
    onOpenBlocked: () -> Unit,
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Security", onBack = onBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            GagaSettingsRow(
                title = "App lock",
                subtitle = "Require device unlock to open GaGa Chat",
                leadingIcon = Icons.Filled.Lock,
                trailing = {
                    Switch(
                        checked = state.appLockEnabled,
                        onCheckedChange = viewModel::setAppLockEnabled,
                    )
                },
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Blocked users",
                subtitle = "People you've blocked",
                leadingIcon = Icons.Filled.Security,
                onClick = onOpenBlocked,
            )
            GagaDivider()
            Text(
                text = "Messages and calls are protected in transit. GaGa Chat never " +
                    "stores your password on the device.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(GagaDimens.space16),
            )
        }
    }
}

/** Accessibility settings (Master Spec §C). */
@Composable
fun AccessibilitySettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    GagaScaffold(title = "Accessibility", onBack = onBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            GagaSectionHeader("TEXT SIZE")
            TextScale.entries.forEach { scale ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectable(
                            selected = state.textScale == scale,
                            onClick = { viewModel.setTextScale(scale) },
                        )
                        .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space12),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(
                        selected = state.textScale == scale,
                        onClick = { viewModel.setTextScale(scale) },
                    )
                    Spacer(Modifier.width(GagaDimens.space8))
                    Text(text = scale.label(), style = MaterialTheme.typography.bodyLarge)
                }
            }
            GagaDivider()
            Spacer(Modifier.height(GagaDimens.space16))
            GagaPrimaryButton(
                text = "Open system accessibility settings",
                onClick = {
                    runCatching {
                        context.startActivity(
                            Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                        )
                    }
                },
                leadingIcon = Icons.Filled.Accessibility,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space16),
            )
            Spacer(Modifier.height(GagaDimens.space32))
        }
    }
}

private fun TextScale.label(): String = when (this) {
    TextScale.SMALL -> "Small"
    TextScale.DEFAULT -> "Default"
    TextScale.LARGE -> "Large"
}

/** Language settings (Master Spec §C). */
@Composable
fun LanguageSettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Language", onBack = onBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            GagaSectionHeader("APP LANGUAGE")
            AppLanguage.entries.forEach { language ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectable(
                            selected = state.language == language,
                            onClick = { viewModel.setLanguage(language) },
                        )
                        .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space12),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(
                        selected = state.language == language,
                        onClick = { viewModel.setLanguage(language) },
                    )
                    Spacer(Modifier.width(GagaDimens.space8))
                    Text(text = language.label, style = MaterialTheme.typography.bodyLarge)
                }
            }
            GagaDivider()
            Text(
                text = "Your choice is saved on this device.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(GagaDimens.space16),
            )
        }
    }
}

/**
 * Delete Account (Master Spec §C / Item 40 — Play Store requirement).
 *
 * A destructive, irreversible action guarded by an explicit confirmation dialog.
 * On success the repository clears the session and [onDeleted] returns the app to
 * the auth graph.
 */
@Composable
fun DeleteAccountSettingsScreen(
    onBack: () -> Unit,
    onDeleted: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var confirmVisible by remember { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.accountDeleted) {
        if (state.accountDeleted) onDeleted()
    }
    LaunchedEffect(Unit) {
        viewModel.notices.collect { snackbar.showSnackbar(it) }
    }

    GagaScaffold(title = "Delete account", onBack = onBack, snackbarHostState = snackbar) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            Text(
                text = "Deleting your account is permanent. This removes your profile, " +
                    "messages, media, friends and call history from GaGa Chat, and signs " +
                    "you out on every device. This action cannot be undone.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(GagaDimens.space16),
            )
            GagaDivider()
            GagaPrimaryButton(
                text = "Delete my account",
                onClick = { confirmVisible = true },
                enabled = !state.isDeletingAccount,
                loading = state.isDeletingAccount,
                leadingIcon = Icons.Filled.DeleteSweep,
                modifier = Modifier.padding(GagaDimens.space16),
            )
        }
    }

    if (confirmVisible) {
        AlertDialog(
            onDismissRequest = { if (!state.isDeletingAccount) confirmVisible = false },
            icon = { Icon(Icons.Filled.DeleteSweep, contentDescription = null) },
            title = { Text("Delete account?") },
            text = {
                Text(
                    "This will permanently delete your GaGa Chat account and all of your " +
                        "data. You cannot undo this.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = { viewModel.deleteAccount() },
                    enabled = !state.isDeletingAccount,
                ) {
                    Text(
                        text = if (state.isDeletingAccount) "Deleting…" else "Delete",
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { confirmVisible = false },
                    enabled = !state.isDeletingAccount,
                ) {
                    Text("Cancel")
                }
            },
        )
    }
}

/** Hosted legal pages for GaGa Chat (same host used by the app's deep links). */
private const val TERMS_URL = "https://gagachat.app/terms"
private const val PRIVACY_URL = "https://gagachat.app/privacy"