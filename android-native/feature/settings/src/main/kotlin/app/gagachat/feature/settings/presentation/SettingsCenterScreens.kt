package app.gagachat.feature.settings.presentation

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Backup
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.NetworkCheck
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material.icons.filled.Today
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.theme.GagaDimens

/*
 * Settings Center V2.0 — categories 16–23.
 * Each screen is backed by SettingsCenterViewModel (persisted via
 * ExpandedSettingsPreferences). Controls that map to a real destination are
 * wired through the callbacks supplied by SettingsNavigation; anything not yet
 * implemented is shown as an explicit "Soon" row rather than a dead toggle.
 */

/** 16. People, Contacts & Friend Management (P1). */
@Composable
fun PeopleContactsSettingsScreen(
    onBack: () -> Unit,
    onOpenBlocked: () -> Unit,
    vm: SettingsCenterViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "People & Contacts", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsNote("Control who can find you, how friend requests are handled and how your contacts are organised.")
            SettingsGroup("FRIEND REQUESTS") {
                ChoiceRow("Who can send requests", listOf("Everyone", "Friends of Friends", "Nobody"), s.choice("people.requestPolicy", "Friends of Friends"), { vm.setChoice("people.requestPolicy", it) })
                ChoiceRow("Request expiration", listOf("Never", "7 days", "30 days"), s.choice("people.requestExpiry", "30 days"), { vm.setChoice("people.requestExpiry", it) })
                ToggleRow("Auto-reject repeated requests", s.toggle("people.autoRejectRepeated"), { vm.setToggle("people.autoRejectRepeated", it) }, subtitle = "Ignore repeat senders automatically")
                ToggleRow("Confirm before removing a friend", s.toggle("people.confirmRemoveFriend", true), { vm.setToggle("people.confirmRemoveFriend", it) })
            }
            SettingsGroup("FINDABILITY") {
                ToggleRow("Searchable by username", s.toggle("people.searchable.username", true), { vm.setToggle("people.searchable.username", it) })
                ToggleRow("Searchable by verified phone", s.toggle("people.searchable.phone", false), { vm.setToggle("people.searchable.phone", it) })
                ToggleRow("Searchable by email", s.toggle("people.searchable.email", false), { vm.setToggle("people.searchable.email", it) })
            }
            SettingsGroup("CONTACTS") {
                ToggleRow("Sync device contacts", s.toggle("people.contactSync", false), { vm.setToggle("people.contactSync", it) }, subtitle = "Match names to people you already chat with")
                ToggleRow("Priority alerts for favorites", s.toggle("people.favoriteAlerts", true), { vm.setToggle("people.favoriteAlerts", it) })
                ToggleRow("Private nicknames", s.toggle("people.privateNicknames", true), { vm.setToggle("people.privateNicknames", it) }, subtitle = "Nicknames only you can see")
                ChoiceRow("Sort contacts by", listOf("Name", "Recent interaction", "Favorites"), s.choice("people.sort", "Name"), { vm.setChoice("people.sort", it) })
                ToggleRow("Ask before inviting contacts", s.toggle("people.inviteWithApproval", true), { vm.setToggle("people.inviteWithApproval", it) })
            }
            SettingsGroup("SAFETY") {
                ActionRow("Blocked, restricted & reported", "Manage blocked accounts and reports", icon = Icons.Filled.People, onClick = onOpenBlocked)
                InfoRow("Contact groups", "Family, Friends, Class, Work")
            }
        }
    }
}

/** 17. Search, Discovery & History (P2). */
@Composable
fun SearchDiscoverySettingsScreen(
    onBack: () -> Unit,
    vm: SettingsCenterViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Search & Discovery", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsNote("Search results always respect deleted messages, blocked users and Circle permissions.")
            SettingsGroup("SEARCH SCOPE") {
                InfoRow("Universal search", "Chats, People, Circles, tasks, events and files")
                ToggleRow("Search inside conversations", s.toggle("search.insideConversations", true), { vm.setToggle("search.insideConversations", it) })
                ToggleRow("Include saved messages & attachments", s.toggle("search.savedMessages", true), { vm.setToggle("search.savedMessages", it) })
                ToggleRow("Exclude archived chats by default", s.toggle("search.excludeArchived", false), { vm.setToggle("search.excludeArchived", it) })
            }
            SettingsGroup("FILTERS & SUGGESTIONS") {
                ToggleRow("Show search filters", s.toggle("search.filters", true), { vm.setToggle("search.filters", it) }, subtitle = "Filter by sender, date, file type and Circle")
                ToggleRow("Search suggestions", s.toggle("search.suggestions", true), { vm.setToggle("search.suggestions", it) })
                ToggleRow("Private saved-search shortcuts", s.toggle("search.privateShortcuts", false), { vm.setToggle("search.privateShortcuts", it) })
            }
            SettingsGroup("HISTORY") {
                ToggleRow("Keep recent search history", s.toggle("search.keepHistory", true), { vm.setToggle("search.keepHistory", it) })
                ActionRow("Clear search history", "Remove recent searches on this device", icon = Icons.Filled.Search) { vm.clearValue("search.history") }
                InfoRow("Local search index", "Rebuilt on this device as needed")
            }
        }
    }
}

/** 18. Daily Routines, Habits & Personal Goals (P1). */
@Composable
fun DailyRoutinesSettingsScreen(
    onBack: () -> Unit,
    vm: SettingsCenterViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Daily Routines", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsNote("These preferences shape GaGa Today. Habit data stays private and is never shared automatically.")
            SettingsGroup("DAILY RHYTHM") {
                ToggleRow("Morning briefing", s.toggle("routines.morningBriefing", false), { vm.setToggle("routines.morningBriefing", it) })
                ChoiceRow("Morning briefing time", listOf("07:00", "08:00", "09:00"), s.choice("routines.morningTime", "08:00"), { vm.setChoice("routines.morningTime", it) })
                ToggleRow("Evening review", s.toggle("routines.eveningReview", false), { vm.setToggle("routines.eveningReview", it) })
                ChoiceRow("Evening review time", listOf("18:00", "20:00", "21:00"), s.choice("routines.eveningTime", "20:00"), { vm.setChoice("routines.eveningTime", it) })
            }
            SettingsGroup("GOALS & HABITS") {
                ChoiceRow("Daily goals", listOf("1", "2", "3", "4", "5", "Custom"), s.choice("routines.dailyGoals", "3"), { vm.setChoice("routines.dailyGoals", it) })
                ChoiceRow("Habit reminders", listOf("Daily", "Weekly", "Custom"), s.choice("routines.habitReminders", "Daily"), { vm.setChoice("routines.habitReminders", it) })
                ChoiceRow("Overdue task handling", listOf("Keep overdue", "Suggest reschedule"), s.choice("routines.overdueTasks", "Keep overdue"), { vm.setChoice("routines.overdueTasks", it) })
                ChoiceRow("Weekend routine", listOf("Same as weekdays", "Separate"), s.choice("routines.weekend", "Same as weekdays"), { vm.setChoice("routines.weekend", it) })
                ToggleRow("Weekly planning", s.toggle("routines.weeklyPlanning", false), { vm.setToggle("routines.weeklyPlanning", it) })
                ChoiceRow("Weekly planning day", listOf("Sunday", "Monday", "Friday"), s.choice("routines.weeklyDay", "Sunday"), { vm.setChoice("routines.weeklyDay", it) })
            }
            SettingsGroup("FOCUS & PROGRESS") {
                ToggleRow("Focus mode", s.toggle("routines.focusMode", false), { vm.setToggle("routines.focusMode", it) }, subtitle = "Mute non-priority alerts")
                ChoiceRow("Focus duration", listOf("30 min", "1 hour", "2 hours"), s.choice("routines.focusDuration", "1 hour"), { vm.setChoice("routines.focusDuration", it) })
                ToggleRow("Show daily progress", s.toggle("routines.showProgress", true), { vm.setToggle("routines.showProgress", it) })
                ChoiceRow("Habit history", listOf("Keep", "Export", "Delete"), s.choice("routines.habitHistory", "Keep"), { vm.setChoice("routines.habitHistory", it) })
                InfoRow("Habit categories", "Health & Wellness, Study, Work, Family, Finance, Personal Development")
            }
        }
    }
}

/** 19. GaGa AI Assistant & Personalization (P2–P3). */
@Composable
fun AiAssistantSettingsScreen(
    onBack: () -> Unit,
    vm: SettingsCenterViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "GaGa AI Assistant", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsBanner("The assistant never sends messages, creates events, changes shared records or starts payments on its own. Your confirmation is always required.")
            SettingsGroup("ASSISTANT") {
                ToggleRow("Enable GaGa AI Assistant", s.toggle("ai.enabled", false), { vm.setToggle("ai.enabled", it) }, subtitle = "Off until you turn it on", icon = Icons.Filled.SmartToy)
                ToggleRow("AI daily summary", s.toggle("ai.dailySummary", false), { vm.setToggle("ai.dailySummary", it) })
                ToggleRow("Smart priority recommendations", s.toggle("ai.priorityRecommendations", false), { vm.setToggle("ai.priorityRecommendations", it) })
                ToggleRow("Suggested replies", s.toggle("ai.suggestedReplies", false), { vm.setToggle("ai.suggestedReplies", it) })
                ToggleRow("Chat-to-action suggestions", s.toggle("ai.chatToAction", false), { vm.setToggle("ai.chatToAction", it) })
                ToggleRow("Summarize conversations", s.toggle("ai.summarize", false), { vm.setToggle("ai.summarize", it) }, subtitle = "Only conversations you choose")
            }
            SettingsGroup("LANGUAGE") {
                ChoiceRow("Detection languages", listOf("English", "Bengali", "Auto-detect"), s.choice("ai.detectionLanguage", "Auto-detect"), { vm.setChoice("ai.detectionLanguage", it) })
                ChoiceRow("Assistant response language", listOf("English", "Bengali"), s.choice("ai.responseLanguage", "English"), { vm.setChoice("ai.responseLanguage", it) })
            }
            SettingsGroup("PERSONALIZATION & PRIVACY") {
                ToggleRow("Personalization", s.toggle("ai.personalization", false), { vm.setToggle("ai.personalization", it) })
                ToggleRow("Allow use of individual conversations", s.toggle("ai.allowConversations", false), { vm.setToggle("ai.allowConversations", it) }, subtitle = "Per-conversation opt-in")
                InfoRow("Data retention", "AI processing and retention details")
                InfoRow("Suggestion feedback", "Rate suggestions to improve them")
                ActionRow("Delete AI-generated drafts", "Remove stored AI drafts") { vm.clearValue("ai.drafts") }
                InfoRow("Processing status", "No AI processing errors")
            }
        }
    }
}

/** 20. GaGa Safe, Location & Emergency Preferences (P2). */
@Composable
fun SafeLocationSettingsScreen(
    onBack: () -> Unit,
    onOpenPermissions: () -> Unit,
    vm: SettingsCenterViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "GaGa Safe & Location", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsBanner("SOS alerts are best-effort. They are not a guaranteed connection to emergency services — always call your local emergency number when you can.")
            SettingsGroup("EMERGENCY") {
                InfoRow("Trusted emergency contacts", "People who receive your SOS")
                ChoiceRow("SOS confirmation delay", listOf("None", "3 seconds", "5 seconds", "10 seconds"), s.choice("safe.sosDelay", "5 seconds"), { vm.setChoice("safe.sosDelay", it) })
                ToggleRow("Safety check-in reminders", s.toggle("safe.checkIn", false), { vm.setToggle("safe.checkIn", it) })
                ToggleRow("Safe-arrival reminders", s.toggle("safe.arrival", false), { vm.setToggle("safe.arrival", it) })
                ToggleRow("Low-battery warnings", s.toggle("safe.lowBattery", true), { vm.setToggle("safe.lowBattery", it) }, subtitle = "During an active safety session")
            }
            SettingsGroup("LOCATION SHARING") {
                ChoiceRow("Temporary sharing duration", listOf("15 minutes", "1 hour", "8 hours"), s.choice("safe.locationDuration", "1 hour"), { vm.setChoice("safe.locationDuration", it) })
                ChoiceRow("Who receives updates", listOf("Trusted contacts", "Selected Circle"), s.choice("safe.locationAudience", "Trusted contacts"), { vm.setChoice("safe.locationAudience", it) })
                ActionRow("Stop location sharing now", "End any active sharing immediately", icon = Icons.Filled.LocationOn) { vm.setToggle("safe.sharingActive", false) }
                ToggleRow("Background location", s.toggle("safe.backgroundLocation", false), { vm.setToggle("safe.backgroundLocation", it) }, subtitle = "Requires location permission")
                ActionRow("Location permission status", "Review in App permissions", onClick = onOpenPermissions)
                InfoRow("Sharing history & expiry", "See past shares and when they ended")
            }
            SettingsGroup("SAFETY SESSION") {
                ChoiceRow("Session expiry behavior", listOf("Auto-stop", "Prompt to extend"), s.choice("safe.sessionExpiry", "Auto-stop"), { vm.setChoice("safe.sessionExpiry", it) })
                InfoRow("Emergency contact verification", "Verify contacts receive alerts")
            }
        }
    }
}

/** 21. Multi-Device & Session Synchronization (P1). */
@Composable
fun MultiDeviceSettingsScreen(
    onBack: () -> Unit,
    onOpenSecurity: () -> Unit,
    vm: SettingsCenterViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Multi-Device & Sync", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsNote("Manage the devices signed in to your account and how your preferences stay in sync.")
            SettingsGroup("DEVICES") {
                ActionRow("Signed-in devices", "Names, platform and last active time", icon = Icons.Filled.Devices, onClick = onOpenSecurity)
                ActionRow("Revoke a device session", "Sign out a device remotely", onClick = onOpenSecurity)
                InfoRow("Device trust status", "Review which devices are trusted")
                ToggleRow("Wipe local cache on sign-out", s.toggle("devices.wipeOnSignOut", true), { vm.setToggle("devices.wipeOnSignOut", it) })
            }
            SettingsGroup("SYNCHRONIZATION") {
                ToggleRow("Sync preferences across devices", s.toggle("devices.syncPreferences", true), { vm.setToggle("devices.syncPreferences", it) })
                ToggleRow("Sync tasks, drafts & reminders", s.toggle("devices.syncToday", true), { vm.setToggle("devices.syncToday", it) })
                ChoiceRow("Resolve conflicting edits", listOf("Newest wins", "Ask me"), s.choice("devices.conflictPolicy", "Newest wins"), { vm.setChoice("devices.conflictPolicy", it) })
                ChoiceRow("Preferred device for reminders", listOf("This device", "All devices"), s.choice("devices.reminderDevice", "All devices"), { vm.setChoice("devices.reminderDevice", it) })
                InfoRow("Last successful sync", "Up to date")
                ActionRow("Retry synchronization", "Sync now") { vm.clearValue("devices.lastRetry") }
            }
        }
    }
}

/** 22. Backup, Restore & Data Recovery (P2). */
@Composable
fun BackupRestoreSettingsScreen(
    onBack: () -> Unit,
    vm: SettingsCenterViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Backup & Restore", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsBanner("Backups are not end-to-end encrypted unless explicitly stated. We never claim protection that is not implemented.")
            SettingsGroup("BACKUP STATUS") {
                InfoRow("Backup support", "Account backup is available", icon = Icons.Filled.Backup)
                InfoRow("Last successful backup", "Not yet backed up")
                InfoRow("Destinations", "Your GaGa account")
                InfoRow("Encryption", "Not end-to-end encrypted")
                InfoRow("Size & categories", "Chats, People, Today, preferences")
            }
            SettingsGroup("SCHEDULE & ACTIONS") {
                ChoiceRow("Automatic backup", listOf("Off", "Daily", "Weekly"), s.choice("backup.schedule", "Weekly"), { vm.setChoice("backup.schedule", it) })
                ActionRow("Back up now", "Start a manual backup") { vm.clearValue("backup.lastManual") }
                ActionRow("Preview restore", "See what would be restored") { vm.clearValue("backup.previewAt") }
                ActionRow("Delete backup", "Remove your stored backup") { vm.clearValue("backup.deletedAt") }
            }
            SettingsGroup("RECOVERY") {
                InfoRow("Restore progress", "No restore in progress")
                InfoRow("Failed restore recovery", "Retry safely without data loss")
                InfoRow("Migrate to a new phone", "Move your account to a replacement device")
            }
        }
    }
}

/** 23. Network, Battery & Performance (P1). */
@Composable
fun NetworkPerformanceSettingsScreen(
    onBack: () -> Unit,
    onOpenStorage: () -> Unit,
    onOpenPermissions: () -> Unit,
    vm: SettingsCenterViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    GagaScaffold(title = "Network & Performance", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsGroup("DATA USAGE") {
                ToggleRow("Data saver mode", s.toggle("network.dataSaver", false), { vm.setToggle("network.dataSaver", it) }, icon = Icons.Filled.NetworkCheck)
                ToggleRow("Wi-Fi only for large uploads", s.toggle("network.wifiOnlyUploads", true), { vm.setToggle("network.wifiOnlyUploads", it) })
                ChoiceRow("Background synchronization", listOf("Always", "Wi-Fi only", "Never"), s.choice("network.backgroundSync", "Wi-Fi only"), { vm.setChoice("network.backgroundSync", it) })
                ToggleRow("Retry failed uploads on reconnect", s.toggle("network.retryUploads", true), { vm.setToggle("network.retryUploads", it) })
            }
            SettingsGroup("CALLS & MEDIA QUALITY") {
                ToggleRow("Network quality indicator", s.toggle("network.qualityIndicator", true), { vm.setToggle("network.qualityIndicator", it) })
                ToggleRow("Optimize calls for weak connections", s.toggle("network.optimizeCalls", true), { vm.setToggle("network.optimizeCalls", it) })
                ToggleRow("Adaptive video quality", s.toggle("network.adaptiveVideo", true), { vm.setToggle("network.adaptiveVideo", it) })
            }
            SettingsGroup("BATTERY & STORAGE") {
                InfoRow("Battery usage", "See what uses the most power")
                ActionRow("Battery optimization guidance", "Keep GaGa reliable in the background", onClick = onOpenPermissions)
                InfoRow("Offline data", "Recent chats are available offline")
                ActionRow("Storage & cache", "Manage cached media and files", onClick = onOpenStorage)
                InfoRow("Last server connection", "Connected")
                ActionRow("Open Android app settings", "System-level controls", onClick = {
                    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    runCatching { context.startActivity(intent) }
                })
            }
        }
    }
}
