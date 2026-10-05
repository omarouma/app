package app.gagachat.feature.settings.presentation

import app.gagachat.core.model.PrivacyAudience
import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Accessibility
import androidx.compose.material.icons.filled.BatteryAlert
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Contacts
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Email
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
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Vibration
import androidx.compose.material3.Icon
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.common.system.BatteryOptimization
import app.gagachat.core.data.preferences.AppLanguage
import app.gagachat.core.data.preferences.ChatBackground
import app.gagachat.core.data.preferences.MediaDownloadPolicy
import app.gagachat.core.data.preferences.TextScale
import app.gagachat.core.data.preferences.ThemeMode
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaPasswordField
import app.gagachat.core.ui.component.GagaSettingsRow
import app.gagachat.core.ui.theme.GagaDimens
import kotlinx.coroutines.launch

/** Notifications settings (Master Spec §C). */
@Composable
fun NotificationsSettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val contextForNotifications = LocalContext.current
    var selectingPreview by remember { mutableStateOf(false) }
    if (selectingPreview) AlertDialog(onDismissRequest = { selectingPreview = false }, title = { Text("Notification previews") }, text = { Column { app.gagachat.core.data.preferences.NotificationPreview.entries.forEach { value -> TextButton(onClick = { viewModel.setPreview(value); selectingPreview = false }) { Text(value.label) } } } }, confirmButton = {})
    GagaScaffold(title = "Notifications", onBack = onBack) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())) {
            GagaSettingsRow(title = "Android notification settings", subtitle = "Manage message, group and call channels", onClick = { contextForNotifications.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, contextForNotifications.packageName)) })
            GagaSettingsRow(title = "Notification previews", subtitle = state.preview.label + " • this device", onClick = { selectingPreview = true })
            GagaDivider()
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
            GagaSettingsRow(
                title = "Call sounds",
                subtitle = "Ringtone for incoming calls and ringback for outgoing",
                leadingIcon = Icons.Filled.Call,
                trailing = {
                    Switch(
                        checked = state.callSoundsEnabled,
                        onCheckedChange = viewModel::setCallSoundsEnabled,
                    )
                },
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Call vibration",
                subtitle = "Vibrate when a call is ringing",
                leadingIcon = Icons.Filled.Vibration,
                trailing = {
                    Switch(
                        checked = state.callVibrationEnabled,
                        onCheckedChange = viewModel::setCallVibrationEnabled,
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
    var selection by remember { mutableStateOf<Triple<String, String, List<PrivacyAudience>>?>(null) }
    val audiences = listOf(PrivacyAudience.EVERYONE, PrivacyAudience.FRIENDS, PrivacyAudience.NOBODY)
    fun choose(key: String, title: String, options: List<PrivacyAudience> = audiences) {
        if (!state.privacyLoading && !state.privacySaving && state.privacyError == null) selection = Triple(key, title, options)
    }
    var showingRequests by remember { mutableStateOf(false) }
    if (showingRequests) AlertDialog(onDismissRequest = { showingRequests = false }, title = { Text("Message requests") },
        text = { Column(Modifier.verticalScroll(rememberScrollState())) {
            state.requestError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (state.requests.isEmpty() && state.requestError == null) Text("No pending requests")
            state.requests.forEach { request ->
                Text(request.senderName, style = MaterialTheme.typography.titleMedium)
                Text(request.preview.take(500), style = MaterialTheme.typography.bodyMedium)
                Row { TextButton(onClick = { viewModel.respondToRequest(request.id, "accept") }) { Text("Accept") }
                    TextButton(onClick = { viewModel.respondToRequest(request.id, "delete") }) { Text("Delete") }
                    TextButton(onClick = { viewModel.respondToRequest(request.id, "block") }) { Text("Block") } }
                GagaDivider()
            }
        } }, confirmButton = { TextButton(onClick = viewModel::loadRequests) { Text("Refresh") } })
    GagaScaffold(title = "Privacy", onBack = onBack) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())) {
            if (state.privacyLoading || state.privacySaving) Text(if (state.privacySaving) "Saving account privacy…" else "Loading account privacy…", Modifier.padding(16.dp))
            state.privacyError?.let { error ->
                Text(error, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error)
                TextButton(onClick = { viewModel.refreshPrivacy() }) { Text("Retry") }
            }
            GagaSectionHeader("Identity and visibility")
            GagaSettingsRow(title = "Last seen", subtitle = state.privacy.lastSeen.label, onClick = { choose("last_seen", "Last seen") })
            GagaSettingsRow(title = "Online status", subtitle = state.privacy.onlineStatus.label, onClick = { choose("online_status", "Online status", listOf(PrivacyAudience.EVERYONE, PrivacyAudience.SAME_AS_LAST_SEEN, PrivacyAudience.NOBODY)) })
            GagaSettingsRow(title = "Profile photo", subtitle = state.privacy.profilePhoto.label, onClick = { choose("profile_photo", "Profile photo") })
            GagaSettingsRow(title = "Bio / About", subtitle = state.privacy.bio.label, onClick = { choose("bio", "Bio / About") })
            val privateAudiences = listOf(PrivacyAudience.EVERYONE, PrivacyAudience.FRIENDS, PrivacyAudience.ONLY_ME)
            GagaSettingsRow(title = "Friend list", subtitle = state.privacy.friendList.label, onClick = { choose("friend_list", "Friend list", privateAudiences) })
            GagaSettingsRow(title = "Phone visibility", subtitle = state.privacy.phone.label, onClick = { choose("phone", "Phone visibility", privateAudiences) })
            GagaSettingsRow(title = "Email visibility", subtitle = state.privacy.email.label, onClick = { choose("email", "Email visibility", privateAudiences) })
            GagaSectionHeader("Messages and calls")
            GagaSettingsRow(title = "Message requests", subtitle = "Review, accept, delete or block unknown senders", onClick = { showingRequests = true; viewModel.loadRequests() })
            GagaSettingsRow(title = "Who can message me", subtitle = state.privacy.messages.label, onClick = { choose("messages", "Who can message me", listOf(PrivacyAudience.EVERYONE, PrivacyAudience.FRIENDS, PrivacyAudience.REQUESTS)) })
            GagaSettingsRow(title = "Who can call me", subtitle = state.privacy.calls.label, onClick = { choose("calls", "Who can call me") })
            Text("Group invitation controls are being completed; direct messaging and calling controls apply now.", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(16.dp))
            GagaSettingsRow(title = "Read receipts", subtitle = "Share read state in direct and group chats", trailing = { Switch(checked = state.privacy.readReceipts, enabled = !state.privacyLoading && !state.privacySaving && state.privacyError == null, onCheckedChange = viewModel::setReadReceiptsEnabled) })
            GagaSettingsRow(title = "Typing indicator", subtitle = "Share typing activity; indicators expire automatically", trailing = { Switch(checked = state.privacy.typingIndicator, enabled = !state.privacyLoading && !state.privacySaving && state.privacyError == null, onCheckedChange = { viewModel.savePrivacyBoolean("typing_indicator", it) }) })
            GagaSettingsRow(title = "Blocked users", subtitle = "Manage blocked accounts", leadingIcon = Icons.Filled.Lock, onClick = onOpenBlocked)
            GagaSectionHeader("Discovery")
            for ((key, title, value) in listOf(Triple("discover_phone", "Find me by phone", state.privacy.discoverPhone), Triple("discover_email", "Find me by email", state.privacy.discoverEmail), Triple("discover_id", "Find me by exact GaGa ID", state.privacy.discoverId), Triple("recommendations", "Include me in people recommendations", state.privacy.recommendations))) {
                GagaSettingsRow(title = title, subtitle = "Independent of contact-detail visibility", trailing = { Switch(checked = value, enabled = !state.privacyLoading && !state.privacySaving && state.privacyError == null, onCheckedChange = { viewModel.savePrivacyBoolean(key, it) }) })
            }
            Text("These settings apply to your account across devices. A connection is required to save changes.", Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium)
        }
    }
    selection?.let { (key, title, options) ->
        AlertDialog(onDismissRequest = { selection = null }, title = { Text(title) }, text = {
            Column { options.forEach { audience -> TextButton(onClick = { viewModel.savePrivacyAudience(key, audience.name); selection = null }) { Text(audience.label) } } }
        }, confirmButton = { TextButton(onClick = { selection = null }) { Text("Cancel") } })
    }
}

/** Appearance settings (Master Spec §C + spec §11 completeness). */
@Composable
fun AppearanceSettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Appearance", onBack = onBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
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
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = mode.title(), style = MaterialTheme.typography.bodyLarge)
                        Text(
                            text = mode.description(),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            GagaDivider()

            GagaSectionHeader("CHAT WALLPAPER")
            ChatBackground.entries.forEach { background ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectable(
                            selected = state.chatBackground == background,
                            onClick = { viewModel.setChatBackground(background) },
                        )
                        .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space12),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(
                        selected = state.chatBackground == background,
                        onClick = { viewModel.setChatBackground(background) },
                    )
                    Spacer(Modifier.width(GagaDimens.space8))
                    Text(
                        text = background.label,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.weight(1f),
                    )
                    Box(
                        modifier = Modifier
                            .size(GagaDimens.iconMedium)
                            .clip(CircleShape)
                            .background(
                                background.argb?.let { Color(it.toInt()) }
                                    ?: MaterialTheme.colorScheme.surfaceVariant,
                            )
                            .border(
                                width = 1.dp,
                                color = MaterialTheme.colorScheme.outlineVariant,
                                shape = CircleShape,
                            ),
                    )
                }
            }
            GagaDivider()
            Text(
                text = "The wallpaper applies to all chats. You can also change it from " +
                    "the menu inside any chat.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(GagaDimens.space16),
            )
            Spacer(Modifier.height(GagaDimens.space32))
        }
    }
}

private fun ThemeMode.title(): String = when (this) {
    ThemeMode.SYSTEM -> "System default"
    ThemeMode.LIGHT -> "Light"
    ThemeMode.DARK -> "Dark"
}

private fun ThemeMode.description(): String = when (this) {
    ThemeMode.SYSTEM -> "Match your device's light or dark setting"
    ThemeMode.LIGHT -> "Always use the light theme"
    ThemeMode.DARK -> "Always use the dark theme"
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

/** About screen (Master Spec §C + spec §11 completeness). */
@Composable
fun AboutSettingsScreen(onBack: () -> Unit) {
    val uriHandler = LocalUriHandler.current
    val context = LocalContext.current
    val versionLabel = remember { appVersionLabel(context) }
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var showLicenses by remember { mutableStateOf(false) }

    GagaScaffold(title = "About", onBack = onBack, snackbarHostState = snackbar) { padding ->
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
                title = "Rate GaGa Chat",
                subtitle = "Leave a review on Google Play",
                leadingIcon = Icons.Filled.Star,
                leadingIconTint = AboutGreen,
                onClick = { openPlayStore(context) },
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Contact support",
                subtitle = SUPPORT_EMAIL,
                leadingIcon = Icons.Filled.Email,
                leadingIconTint = AboutGreen,
                onClick = { emailSupport(context) },
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Open-source licences",
                subtitle = "Libraries used in this app",
                leadingIcon = Icons.Filled.Description,
                leadingIconTint = AboutGreen,
                onClick = { showLicenses = true },
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Terms of service",
                leadingIcon = Icons.Filled.Check,
                leadingIconTint = AboutGreen,
                onClick = { runCatching { uriHandler.openUri(TERMS_URL) } },
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Privacy policy",
                leadingIcon = Icons.Filled.Lock,
                leadingIconTint = AboutGreen,
                onClick = { runCatching { uriHandler.openUri(PRIVACY_URL) } },
            )
            GagaDivider()
            GagaSettingsRow(
                title = "Copy version info",
                subtitle = "Version $versionLabel",
                leadingIcon = Icons.Filled.ContentCopy,
                leadingIconTint = AboutGreen,
                onClick = {
                    copyToClipboard(context, "GaGa Chat version", versionLabel)
                    scope.launch { snackbar.showSnackbar("Version copied") }
                },
            )
            GagaDivider()
            Spacer(Modifier.height(GagaDimens.space32))
        }
    }

    if (showLicenses) {
        AlertDialog(
            onDismissRequest = { showLicenses = false },
            title = { Text("Open-source licences") },
            text = {
                Column(
                    modifier = Modifier
                        .heightIn(max = 360.dp)
                        .verticalScroll(rememberScrollState()),
                ) {
                    Text(text = LICENSES_TEXT, style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = {
                TextButton(onClick = { showLicenses = false }) { Text("Close") }
            },
        )
    }
}

/** Copies [text] to the system clipboard under [label]. */
private fun copyToClipboard(context: Context, label: String, text: String) {
    runCatching {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText(label, text))
    }
}

/** Opens the GaGa Chat Play Store listing (falls back to the web listing). */
private fun openPlayStore(context: Context) {
    val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val web = Intent(
        Intent.ACTION_VIEW,
        Uri.parse("https://play.google.com/store/apps/details?id=${context.packageName}"),
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(market) }
        .onFailure { runCatching { context.startActivity(web) } }
}

/**
 * App permissions (spec §1 P0 / §6). Every row shows a *readable* state — Allowed,
 * Not allowed, Selected photos only, or Managed by Android — as text plus an icon,
 * never colour alone. States refresh whenever the screen resumes so returning from
 * a system dialog is reflected immediately. Background reliability is presented
 * separately as a troubleshooting row: it is a battery-settings grant, not a
 * runtime permission, and it cannot guarantee that calls will ring.
 */
@Composable
fun AppPermissionsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    var refreshTick by remember { mutableStateOf(0) }
    val rows = remember {
        listOf(
            PermRow(
                label = "Notifications",
                description = "Message and call alerts",
                permissions = notificationPermissions(),
                icon = Icons.Filled.NotificationsActive,
                // Before Android 13 notifications are an OS setting, not a prompt.
                managed = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU,
            ),
            PermRow(
                label = "Camera",
                description = "Video calls and QR scanning",
                permissions = listOf(Manifest.permission.CAMERA),
                icon = Icons.Filled.CameraAlt,
            ),
            PermRow(
                label = "Microphone",
                description = "Voice messages and calls",
                permissions = listOf(Manifest.permission.RECORD_AUDIO),
                icon = Icons.Filled.Mic,
            ),
            PermRow(
                label = "Contacts",
                description = "Optional — you can also add people by GaGa ID or QR",
                permissions = listOf(Manifest.permission.READ_CONTACTS),
                icon = Icons.Filled.Contacts,
            ),
            PermRow(
                label = "Photos & media",
                description = "Send and save photos and videos",
                permissions = mediaPermissions(),
                icon = Icons.Filled.PhotoLibrary,
                partialPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED
                } else {
                    null
                },
            ),
            PermRow(
                label = "Location",
                description = "Share your location in chats",
                permissions = listOf(Manifest.permission.ACCESS_FINE_LOCATION),
                icon = Icons.Filled.LocationOn,
            ),
        )
    }
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { refreshTick++ }

    // Battery-optimization exemption is a settings grant, not a runtime
    // permission. Re-read it (and every permission row) on resume so returning
    // from the system dialog reflects the new state.
    var batteryExempt by remember { mutableStateOf(BatteryOptimization.isIgnoring(context)) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                batteryExempt = BatteryOptimization.isIgnoring(context)
                refreshTick++
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    GagaScaffold(title = "App permissions", onBack = onBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            Text(
                text = "Control what GaGa Chat can access. Every permission is optional — " +
                    "text chat keeps working without them. Tap a row to change it.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(GagaDimens.space16),
            )
            rows.forEach { row ->
                // Reading refreshTick forces recomposition after a request/resume.
                val state = refreshTick.let { row.state(context) }
                PermissionStatusRow(
                    row = row,
                    state = state,
                    onRequest = {
                        if (row.permissions.isNotEmpty()) {
                            launcher.launch(row.permissions.toTypedArray())
                        }
                    },
                )
                GagaDivider()
            }

            GagaSectionHeader("TROUBLESHOOTING")
            // Background reliability is deliberately NOT a permission row: it is a
            // battery-optimisation setting, and it cannot guarantee ringing.
            GagaSettingsRow(
                title = "Background reliability",
                subtitle = if (batteryExempt) {
                    "Allowed. Calls can ring while the app is idle. Some device makers " +
                        "still delay background apps."
                } else {
                    "Not allowed. Android may delay calls when the app is idle. Tap to open " +
                        "battery settings and let GaGa run in the background."
                },
                leadingIcon = Icons.Filled.BatteryAlert,
                leadingIconTint = MaterialTheme.colorScheme.onSurfaceVariant,
                onClick = { BatteryOptimization.request(context) },
                trailing = {
                    Icon(
                        imageVector = if (batteryExempt) Icons.Filled.CheckCircle else Icons.Filled.Info,
                        contentDescription = if (batteryExempt) "Allowed" else "Action needed",
                        tint = if (batteryExempt) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                },
            )
            GagaDivider()
            Text(
                text = "Background reliability depends on your device's battery settings and " +
                    "cannot be guaranteed by any app. If calls don't ring when GaGa is closed, " +
                    "open your device settings and disable battery optimisation for GaGa Chat.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(GagaDimens.space16),
            )

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

/** Human-readable permission state — never conveyed by colour alone (spec §6). */
private enum class PermState { ALLOWED, PARTIAL, DENIED, MANAGED }

private fun PermState.label(): String = when (this) {
    PermState.ALLOWED -> "Allowed"
    PermState.PARTIAL -> "Selected photos only"
    PermState.DENIED -> "Not allowed"
    PermState.MANAGED -> "Managed by Android"
}

private data class PermRow(
    val label: String,
    val description: String,
    val permissions: List<String>,
    val icon: ImageVector,
    /** True when the OS owns this capability and there is no runtime prompt. */
    val managed: Boolean = false,
    /** Android 14+ partial-access permission ("Selected photos only"). */
    val partialPermission: String? = null,
) {
    fun state(context: Context): PermState {
        if (managed || permissions.isEmpty()) return PermState.MANAGED
        val allGranted = permissions.all {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }
        if (allGranted) return PermState.ALLOWED
        if (partialPermission != null &&
            ContextCompat.checkSelfPermission(context, partialPermission) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            return PermState.PARTIAL
        }
        return PermState.DENIED
    }
}

/**
 * A permission row that shows its state as text + icon (never colour alone).
 * Denied rows are tappable to re-request; granted / managed rows are informational.
 */
@Composable
private fun PermissionStatusRow(
    row: PermRow,
    state: PermState,
    onRequest: () -> Unit,
) {
    val statusColor = when (state) {
        PermState.ALLOWED -> MaterialTheme.colorScheme.primary
        PermState.PARTIAL -> MaterialTheme.colorScheme.tertiary
        PermState.DENIED -> MaterialTheme.colorScheme.error
        PermState.MANAGED -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    val statusIcon = when (state) {
        PermState.ALLOWED -> Icons.Filled.CheckCircle
        PermState.PARTIAL -> Icons.Filled.PhotoLibrary
        PermState.DENIED -> Icons.Filled.Close
        PermState.MANAGED -> Icons.Filled.Info
    }
    GagaSettingsRow(
        title = row.label,
        subtitle = row.description,
        leadingIcon = row.icon,
        onClick = if (state == PermState.DENIED) onRequest else null,
        trailing = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = statusIcon,
                    contentDescription = null,
                    tint = statusColor,
                )
                Spacer(Modifier.width(GagaDimens.space4))
                Text(
                    text = state.label(),
                    style = MaterialTheme.typography.labelMedium,
                    color = statusColor,
                )
            }
        },
    )
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
    val context = LocalContext.current
    val secureDevice = (context.getSystemService(android.content.Context.KEYGUARD_SERVICE) as? android.app.KeyguardManager)?.isDeviceSecure == true
    var passwordVisible by remember { mutableStateOf(false) }
    var sessionsVisible by remember { mutableStateOf(false) }
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    if (passwordVisible) AlertDialog(onDismissRequest = { if (!state.securityBusy) { passwordVisible = false; currentPassword = ""; newPassword = ""; confirmation = "" } }, title = { Text("Change password") },
        text = { Column(Modifier.verticalScroll(rememberScrollState())) {
            GagaPasswordField(currentPassword, { currentPassword = it }, "Current password", enabled = !state.securityBusy)
            GagaPasswordField(newPassword, { newPassword = it }, "New password", enabled = !state.securityBusy)
            GagaPasswordField(confirmation, { confirmation = it }, "Confirm new password", enabled = !state.securityBusy)
            state.securityNotice?.let { Text(it) }
        } }, confirmButton = { TextButton(onClick = { viewModel.changePassword(currentPassword, newPassword, confirmation); currentPassword = ""; newPassword = ""; confirmation = "" }, enabled = !state.securityBusy) { Text(if (state.securityBusy) "Saving…" else "Save") } }, dismissButton = { TextButton(onClick = { passwordVisible = false; currentPassword = ""; newPassword = ""; confirmation = "" }, enabled = !state.securityBusy) { Text("Close") } })
    if (sessionsVisible) AlertDialog(onDismissRequest = { if (!state.securityBusy) { sessionsVisible = false; currentPassword = "" } }, title = { Text("Active sessions") },
        text = { Column(Modifier.verticalScroll(rememberScrollState())) {
            Text("Enter your password to revoke sessions. Revocation blocks subsequent GaGa data requests. Media already connected may continue until the device checks its session.")
            GagaPasswordField(currentPassword, { currentPassword = it }, "Password", enabled = !state.securityBusy)
            state.securityNotice?.let { Text(it) }
            state.sessions.forEach { session ->
                Text(if (session.isCurrent) "This session" else session.userAgent?.take(160) ?: "Unknown device", style = MaterialTheme.typography.titleSmall)
                Text("Last activity: " + (session.lastActivity ?: "Unavailable"), style = MaterialTheme.typography.bodySmall)
                if (!session.isCurrent) TextButton(onClick = { viewModel.revokeSession(session.id, currentPassword); currentPassword = "" }, enabled = !state.securityBusy) { Text("Revoke") }
            }
        } }, confirmButton = { TextButton(onClick = { viewModel.revokeSession(null, currentPassword); currentPassword = "" }, enabled = !state.securityBusy) { Text("Sign out others") } }, dismissButton = { TextButton(onClick = viewModel::loadSessions) { Text("Refresh") } })
    GagaScaffold(title = "Security", onBack = onBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            GagaSettingsRow(
                title = "App lock",
                subtitle = if (secureDevice) "Require device unlock to open GaGa Chat" else "Set a device PIN, pattern or password first",
                onClick = { if (!secureDevice) context.startActivity(Intent(Settings.ACTION_SECURITY_SETTINGS)) },
                leadingIcon = Icons.Filled.Lock,
                trailing = {
                    Switch(
                        checked = state.appLockEnabled,
                        enabled = secureDevice,
                        onCheckedChange = viewModel::setAppLockEnabled,
                    )
                },
            )
            GagaDivider()
            GagaSettingsRow(title = "Change password", subtitle = "Verify your current password before changing it", onClick = { passwordVisible = true })
            GagaSettingsRow(title = "Active sessions", subtitle = "Review devices and sign out other sessions", onClick = { sessionsVisible = true; viewModel.loadSessions() })
            // NOTE: Blocked users lives under Privacy (single source of truth).
            // Security focuses on device/app protection only, so the two screens
            // no longer duplicate the same entry (spec §1 de-duplication).
            Text(
                text = "App lock protects access on this device. It does not revoke other sessions. Network encryption does not guarantee end-to-end encryption.",
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
    var deletionPassword by remember { mutableStateOf("") }
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
                    "owned account records and authentication access. Previously shared copies " +
                    "may remain on other devices. This action cannot be undone.",
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
                Column {
                    Text("Verify your password to permanently delete the account. Previously shared copies may remain on other devices.")
                    GagaPasswordField(deletionPassword, { deletionPassword = it }, "Password", enabled = !state.isDeletingAccount)
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { viewModel.deleteAccount(deletionPassword) },
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

// Single brand green for non-destructive leading icons (spec §1).
private val AboutGreen = Color(0xFF00C300)

/**
 * The principal open-source components that make up GaGa Chat. Full licence
 * texts ship with each project; this is a human-readable acknowledgement.
 */
private const val LICENSES_TEXT =
    "GaGa Chat is built on open-source software. It includes:\n\n" +
        "• Jetpack Compose & AndroidX — Apache License 2.0\n" +
        "• Kotlin & Kotlin Coroutines — Apache License 2.0\n" +
        "• Ktor — Apache License 2.0\n" +
        "• kotlinx.serialization — Apache License 2.0\n" +
        "• Hilt / Dagger — Apache License 2.0\n" +
        "• Room — Apache License 2.0\n" +
        "• Coil — Apache License 2.0\n" +
        "• OkHttp — Apache License 2.0\n" +
        "• LiveKit Android SDK — Apache License 2.0\n" +
        "• WebRTC (io.github.webrtc-sdk) — BSD 3-Clause License\n\n" +
        "Full licence texts are available from each project's repository. " +
        "Thank you to the maintainers of these projects."