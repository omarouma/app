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
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
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
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.Today
import androidx.compose.material.icons.filled.Widgets
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
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
import app.gagachat.core.ui.i18n.GagaStrings
import app.gagachat.core.ui.i18n.LocalGagaStrings
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

private fun settingsEntries(s: GagaStrings): List<SettingsEntry> = listOf(
    SettingsEntry(s.sectionPrivacySecurity, s.privacyTitle, s.privacySubtitle, Icons.Filled.Lock, SettingsRoutes.PRIVACY),
    SettingsEntry(s.sectionPrivacySecurity, s.securityTitle, s.securitySubtitle, Icons.Filled.Security, SettingsRoutes.SECURITY),
    SettingsEntry(s.sectionPrivacySecurity, s.blockedUsersTitle, s.blockedUsersSubtitle, Icons.Filled.Block, SettingsRoutes.BLOCKED),
    SettingsEntry(s.sectionPrivacySecurity, s.antiSpamTitle, s.antiSpamSubtitle, Icons.Filled.Shield, SettingsRoutes.TRUST),
    SettingsEntry(s.sectionPrivacySecurity, s.safeTitle, s.safeSubtitle, Icons.Filled.LocationOn, SettingsRoutes.SAFE),

    SettingsEntry(s.sectionChatsNotifications, s.notificationsTitle, s.notificationsSubtitle, Icons.Filled.Notifications, SettingsRoutes.NOTIFICATIONS),
    SettingsEntry(s.sectionChatsNotifications, s.chatsTitle, s.chatsSubtitle, Icons.AutoMirrored.Filled.Chat, SettingsRoutes.CHATS),
    SettingsEntry(s.sectionChatsNotifications, s.callsTitle, s.callsSubtitle, Icons.Filled.Call, SettingsRoutes.CALLS),
    SettingsEntry(s.sectionChatsNotifications, s.searchDiscoveryTitle, s.searchDiscoverySubtitle, Icons.Filled.Search, SettingsRoutes.SEARCH),

    SettingsEntry(s.sectionTodayDailyLife, s.routinesTitle, s.routinesSubtitle, Icons.Filled.Today, SettingsRoutes.ROUTINES),
    SettingsEntry(s.sectionTodayDailyLife, s.aiAssistantTitle, s.aiAssistantSubtitle, Icons.Filled.SmartToy, SettingsRoutes.AI),
    SettingsEntry(s.sectionTodayDailyLife, s.dashboardTitle, s.dashboardSubtitle, Icons.Filled.Dashboard, SettingsRoutes.DASHBOARD),

    SettingsEntry(s.sectionPeople, s.peopleContactsTitle, s.peopleContactsSubtitle, Icons.Filled.People, SettingsRoutes.PEOPLE_CONTACTS),

    SettingsEntry(s.sectionDeviceData, s.appearanceTitle, s.appearanceSubtitle, Icons.Filled.DarkMode, SettingsRoutes.APPEARANCE),
    SettingsEntry(s.sectionDeviceData, s.dataStorageTitle, s.dataStorageSubtitle, Icons.Filled.Storage, SettingsRoutes.STORAGE),
    SettingsEntry(s.sectionDeviceData, s.networkTitle, s.networkSubtitle, Icons.Filled.NetworkCheck, SettingsRoutes.NETWORK),
    SettingsEntry(s.sectionDeviceData, s.multiDeviceTitle, s.multiDeviceSubtitle, Icons.Filled.Devices, SettingsRoutes.DEVICES),
    SettingsEntry(s.sectionDeviceData, s.backupTitle, s.backupSubtitle, Icons.Filled.Backup, SettingsRoutes.BACKUP),
    SettingsEntry(s.sectionDeviceData, s.widgetsTitle, s.widgetsSubtitle, Icons.Filled.Widgets, SettingsRoutes.WIDGETS),
    SettingsEntry(s.sectionDeviceData, s.languageTitle, s.languageSubtitle, Icons.Filled.Language, SettingsRoutes.LANGUAGE),
    SettingsEntry(s.sectionDeviceData, s.accessibilityTitle, s.accessibilitySubtitle, Icons.Filled.Accessibility, SettingsRoutes.ACCESSIBILITY),
    SettingsEntry(s.sectionDeviceData, s.appPermissionsTitle, s.appPermissionsSubtitle, Icons.Filled.Apps, SettingsRoutes.PERMISSIONS),

    SettingsEntry(s.sectionHelpAbout, s.gettingStartedTitle, s.gettingStartedSubtitle, Icons.Filled.AutoAwesome, SettingsRoutes.GETTING_STARTED),
    SettingsEntry(s.sectionHelpAbout, s.helpSupportTitle, s.helpSupportSubtitle, Icons.AutoMirrored.Filled.HelpOutline, SettingsRoutes.HELP),
    SettingsEntry(s.sectionHelpAbout, s.troubleshootingTitle, s.troubleshootingSubtitle, Icons.Filled.Build, SettingsRoutes.TROUBLESHOOT),
    SettingsEntry(s.sectionHelpAbout, s.aboutTitle, s.aboutSubtitle, Icons.Filled.Info, SettingsRoutes.ABOUT),

    SettingsEntry(s.sectionComingSoon, s.businessTitle, s.businessSubtitle, Icons.Filled.Business, SettingsRoutes.BUSINESS, soon = true),
    SettingsEntry(s.sectionComingSoon, s.premiumTitle, s.premiumSubtitle, Icons.Filled.WorkspacePremium, SettingsRoutes.PREMIUM, soon = true),
    SettingsEntry(s.sectionComingSoon, s.deliveryTitle, s.deliverySubtitle, Icons.Filled.LocalShipping, SettingsRoutes.DELIVERY, soon = true),
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
    val strings = LocalGagaStrings.current
    val versionLabel = remember { appVersionLabel(context) }
    var query by remember { mutableStateOf("") }
    var showPlanned by remember { mutableStateOf(false) }

    LaunchedEffect(state.signedOut) {
        if (state.signedOut) onSignedOut()
    }

    val entries = remember(strings) { settingsEntries(strings) }
    val results = remember(query, entries) {
        if (query.isBlank()) {
            entries
        } else {
            entries.filter {
                it.title.contains(query, ignoreCase = true) ||
                    it.subtitle?.contains(query, ignoreCase = true) == true ||
                    it.section.contains(query, ignoreCase = true)
            }
        }
    }

    GagaScaffold(title = strings.settingsTitle, onBack = onNavigateBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            app.gagachat.core.ui.component.GagaSearchBar(
                query = query, onQueryChange = { query = it },
                placeholder = strings.settingsSearchPlaceholder,
            )

            if (query.isBlank()) {
                GagaSectionHeader(text = strings.sectionAccount)
                GagaSettingsRow(
                    title = state.displayName ?: strings.accountMyProfile,
                    subtitle = state.email ?: state.phone,
                    leadingIcon = Icons.Filled.AccountCircle,
                    leadingIconTint = MaterialTheme.colorScheme.primary,
                    leadingIconContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                    leadingContent = {
                        app.gagachat.core.ui.component.GagaAvatar(imageUrl = state.avatar, name = state.displayName, size = 36.dp)
                    },
                    onClick = onOpenProfile,
                )
                GagaDivider()
                GagaSettingsRow(
                    title = strings.accountEditProfile,
                    subtitle = strings.accountEditProfileSubtitle,
                    leadingIcon = Icons.Filled.Edit,
                    leadingIconTint = MaterialTheme.colorScheme.primary,
                    leadingIconContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                    onClick = { onNavigate(SettingsRoutes.EDIT_PROFILE) },
                )
                GagaDivider()

                results.filterNot { it.soon }.groupBy { it.section }.forEach { (section, sectionEntries) ->
                    GagaSectionHeader(text = section.uppercase())
                    sectionEntries.forEach { entry -> SettingsEntryRow(entry, strings, onNavigate) }
                }
                TextButton(
                    onClick = { showPlanned = !showPlanned },
                    modifier = Modifier.padding(horizontal = GagaDimens.space12),
                ) {
                    Text(if (showPlanned) strings.hidePlannedFeatures else strings.viewPlannedFeatures)
                }
                if (showPlanned) {
                    GagaSectionHeader(text = strings.sectionPlannedFeatures)
                    results.filter { it.soon }.forEach { entry -> SettingsEntryRow(entry, strings, onNavigate) }
                }
            } else {
                if (results.isEmpty()) {
                    Text(
                        text = strings.settingsNoMatch(query),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(GagaDimens.space16),
                    )
                } else {
                    GagaSectionHeader(text = strings.settingsResults(results.size))
                    results.forEach { entry -> SettingsEntryRow(entry, strings, onNavigate) }
                }
            }

            Spacer(Modifier.height(GagaDimens.space16))
            GagaSettingsRow(
                title = strings.signOut,
                leadingIcon = Icons.AutoMirrored.Filled.Logout,
                leadingIconTint = IconRed,
                onClick = viewModel::signOut,
            )
            GagaDivider()
            GagaSettingsRow(
                title = strings.deleteAccount,
                subtitle = strings.deleteAccountSubtitle,
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
private fun SettingsEntryRow(entry: SettingsEntry, strings: GagaStrings, onNavigate: (String) -> Unit) {
    val tint = when (entry.route) {
        SettingsRoutes.PRIVACY, SettingsRoutes.SECURITY -> Color(0xFF5268B5)
        SettingsRoutes.NOTIFICATIONS_INBOX -> Color(0xFF9A6700)
        SettingsRoutes.ACCESSIBILITY -> Color(0xFF8762AF)
        else -> MaterialTheme.colorScheme.primary
    }
    GagaSettingsRow(
        title = entry.title,
        subtitle = entry.subtitle,
        leadingIcon = entry.icon,
        leadingIconTint = tint,
        leadingIconContainerColor = tint.copy(alpha = 0.12f),
        onClick = { onNavigate(entry.route) },
        trailing = if (entry.soon) {
            {
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(GagaDimens.space8),
                ) {
                    Text(
                        text = strings.soonBadge,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space2),
                    )
                }
            }
        } else {
            { Icon(androidx.compose.material.icons.Icons.AutoMirrored.Filled.KeyboardArrowRight, "Open ${entry.title}", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
        },
    )
}

// Single brand green for every non-destructive leading icon (spec §1: one GaGa
// primary green). Red (IconRed) is reserved for destructive actions only.
private val IconGreen = Color(0xFF087F4B)
private val IconRed = Color(0xFFEB5757)
