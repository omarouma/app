package app.gagachat.feature.settings.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Accessibility
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Backup
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.NetworkCheck
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Today
import androidx.compose.material.icons.filled.Widgets
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaSettingsRow
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.feature.settings.navigation.SettingsRoutes

/**
 * One navigable settings destination. The hub is data-driven so the same list
 * powers both the grouped view and the search results, and so adding a category
 * is a one-line change (spec §1 — simple main page, advanced options in
 * submenus; §3 — 30 categories).
 */
private data class SettingsEntry(
    val section: String,
    val title: String,
    val subtitle: String?,
    val icon: ImageVector,
    val route: String,
    val soon: Boolean = false,
)

private val settingsEntries: List<SettingsEntry> = listOf(
    SettingsEntry("Privacy & Security", "Privacy", "Read receipts, last seen and blocked users", Icons.Filled.Lock, SettingsRoutes.PRIVACY),
    SettingsEntry("Privacy & Security", "Security & devices", "App lock, sessions and account protection", Icons.Filled.Security, SettingsRoutes.SECURITY),
    SettingsEntry("Privacy & Security", "Blocked users", "People you've blocked", Icons.Filled.Block, SettingsRoutes.BLOCKED),
    SettingsEntry("Privacy & Security", "Anti-spam & trust", "Spam, scam warnings and reporting", Icons.Filled.Shield, SettingsRoutes.TRUST),
    SettingsEntry("Privacy & Security", "GaGa Safe & location", "SOS, check-ins and location sharing", Icons.Filled.LocationOn, SettingsRoutes.SAFE),

    SettingsEntry("Chats & Notifications", "Notifications", "Messages, groups, calls, previews and sounds", Icons.Filled.Notifications, SettingsRoutes.NOTIFICATIONS),
    SettingsEntry("Chats & Notifications", "Chats & messaging", "Sending, media and history defaults", Icons.AutoMirrored.Filled.Chat, SettingsRoutes.CHATS),
    SettingsEntry("Chats & Notifications", "Calls", "Call handling, audio routing and diagnostics", Icons.Filled.Call, SettingsRoutes.CALLS),
    SettingsEntry("Chats & Notifications", "Search & discovery", "Search scope, filters and history", Icons.Filled.Search, SettingsRoutes.SEARCH),

    SettingsEntry("GaGa Today & Daily Life", "Daily routines & habits", "Briefings, goals, focus and planning", Icons.Filled.Today, SettingsRoutes.ROUTINES),
    SettingsEntry("GaGa Today & Daily Life", "GaGa AI Assistant", "Assistant, suggestions and personalization", Icons.Filled.SmartToy, SettingsRoutes.AI),
    SettingsEntry("GaGa Today & Daily Life", "Dashboard & navigation", "Default tab, layout and formats", Icons.Filled.Dashboard, SettingsRoutes.DASHBOARD),

    SettingsEntry("People", "People & contacts", "Requests, findability and contact sync", Icons.Filled.People, SettingsRoutes.PEOPLE_CONTACTS),

    SettingsEntry("Device & Data", "Appearance", "Theme and chat background", Icons.Filled.DarkMode, SettingsRoutes.APPEARANCE),
    SettingsEntry("Device & Data", "Data & storage", "Auto-download, quality and cache", Icons.Filled.Storage, SettingsRoutes.STORAGE),
    SettingsEntry("Device & Data", "Network & performance", "Data saver, battery and quality", Icons.Filled.NetworkCheck, SettingsRoutes.NETWORK),
    SettingsEntry("Device & Data", "Multi-device & sync", "Devices, sessions and synchronization", Icons.Filled.Devices, SettingsRoutes.DEVICES),
    SettingsEntry("Device & Data", "Backup & restore", "Backups, restore and migration", Icons.Filled.Backup, SettingsRoutes.BACKUP),
    SettingsEntry("Device & Data", "Widgets & shortcuts", "Home screen widgets and quick actions", Icons.Filled.Widgets, SettingsRoutes.WIDGETS),
    SettingsEntry("Device & Data", "Language", "App display language", Icons.Filled.Language, SettingsRoutes.LANGUAGE),
    SettingsEntry("Device & Data", "Accessibility", "Text size and display options", Icons.Filled.Accessibility, SettingsRoutes.ACCESSIBILITY),
    SettingsEntry("Device & Data", "App permissions", "Camera, microphone, contacts, media and more", Icons.Filled.Apps, SettingsRoutes.PERMISSIONS),

    SettingsEntry("Help & About", "Getting started", "Revisit GaGa's three advantages and quick tips", Icons.Filled.AutoAwesome, SettingsRoutes.GETTING_STARTED),
    SettingsEntry("Help & About", "Help & support", "FAQs and contact support", Icons.AutoMirrored.Filled.HelpOutline, SettingsRoutes.HELP),
    SettingsEntry("Help & About", "Troubleshooting", "Diagnostics and connection tests", Icons.Filled.Build, SettingsRoutes.TROUBLESHOOT),
    SettingsEntry("Help & About", "About GaGa Chat", "Version and legal information", Icons.Filled.Info, SettingsRoutes.ABOUT),

    SettingsEntry("Coming soon", "Business & team", "Workspaces, roles and shared tools", Icons.Filled.Business, SettingsRoutes.BUSINESS, soon = true),
    SettingsEntry("Coming soon", "Premium & subscription", "Plans and billing", Icons.Filled.WorkspacePremium, SettingsRoutes.PREMIUM, soon = true),
    SettingsEntry("Coming soon", "Delivery & services", "Local services and deliveries", Icons.Filled.LocalShipping, SettingsRoutes.DELIVERY, soon = true),
)

/**
 * Full settings hub (Master Spec §C; Settings Center V2.0). An account block, a
 * searchable list of the 30 categories grouped under a small number of menus,
 * and the destructive actions pinned to the bottom. Every row leads to a working
 * screen — features that are not implemented are grouped under "Coming soon" and
 * carry an explicit badge rather than a dead toggle.
 */
@Composable
fun SettingsRoute(
    onNavigateBack: () -> Unit,
    onOpenProfile: () -> Unit,
    onNavigate: (String) -> Unit,
    onSignedOut: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val versionLabel = remember { appVersionLabel(context) }
    var query by remember { mutableStateOf("") }

    LaunchedEffect(state.signedOut) {
        if (state.signedOut) onSignedOut()
    }

    val results = remember(query) {
        if (query.isBlank()) {
            settingsEntries
        } else {
            settingsEntries.filter {
                it.title.contains(query, ignoreCase = true) ||
                    it.subtitle?.contains(query, ignoreCase = true) == true ||
                    it.section.contains(query, ignoreCase = true)
            }
        }
    }

    GagaScaffold(title = "Settings", onBack = onNavigateBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Search settings") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                shape = RoundedCornerShape(GagaDimens.space12),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
            )

            if (query.isBlank()) {
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
                    onClick = { onNavigate(SettingsRoutes.EDIT_PROFILE) },
                )
                GagaDivider()

                results.groupBy { it.section }.forEach { (section, entries) ->
                    GagaSectionHeader(text = section.uppercase())
                    entries.forEach { entry -> SettingsEntryRow(entry, onNavigate) }
                }
            } else {
                if (results.isEmpty()) {
                    Text(
                        text = "No settings match \"$query\"",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(GagaDimens.space16),
                    )
                } else {
                    GagaSectionHeader(text = "${results.size} RESULT${if (results.size == 1) "" else "S"}")
                    results.forEach { entry -> SettingsEntryRow(entry, onNavigate) }
                }
            }

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
                onClick = { onNavigate(SettingsRoutes.DELETE_ACCOUNT) },
            )
            Spacer(Modifier.height(GagaDimens.space48))
            Text(
                text = "GaGa Chat • $versionLabel",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = GagaDimens.space16),
            )
        }
    }
}

@Composable
private fun SettingsEntryRow(entry: SettingsEntry, onNavigate: (String) -> Unit) {
    GagaSettingsRow(
        title = entry.title,
        subtitle = entry.subtitle,
        leadingIcon = entry.icon,
        leadingIconTint = IconGreen,
        onClick = { onNavigate(entry.route) },
        trailing = if (entry.soon) {
            {
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(GagaDimens.space8),
                ) {
                    Text(
                        text = "Soon",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space2),
                    )
                }
            }
        } else {
            null
        },
    )
    GagaDivider()
}

// Single brand green for every non-destructive leading icon (spec §1: one GaGa
// primary green). Red (IconRed) is reserved for destructive actions only.
private val IconGreen = Color(0xFF00C300)
private val IconRed = Color(0xFFEB5757)
