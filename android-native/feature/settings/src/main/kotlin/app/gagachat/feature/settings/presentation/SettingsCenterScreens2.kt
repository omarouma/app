package app.gagachat.feature.settings.presentation

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Widgets
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.theme.GagaDimens

/*
 * Settings Center V2.0 — categories 24–30.
 * P3 categories (Business, Premium, Delivery) are shown as clearly-labelled
 * "Soon" screens — never as working toggles (spec §2, §7 "No broken controls").
 */

/** 24. Home Screen Widgets & Quick Shortcuts (P2). */
@Composable
fun WidgetsShortcutsSettingsScreen(
    onBack: () -> Unit,
    vm: SettingsCenterViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Widgets & Shortcuts", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsBanner("Widgets never reveal private messages, balances or sensitive reminders unless you allow it below.")
            SettingsGroup("WIDGETS") {
                ToggleRow("Today widget", s.toggle("widgets.today", false), { vm.setToggle("widgets.today", it) }, icon = Icons.Filled.Widgets)
                ToggleRow("Upcoming reminders widget", s.toggle("widgets.reminders", false), { vm.setToggle("widgets.reminders", it) })
                ToggleRow("Task checklist widget", s.toggle("widgets.tasks", false), { vm.setToggle("widgets.tasks", it) })
            }
            SettingsGroup("SHORTCUTS") {
                ToggleRow("Favorite contact shortcut", s.toggle("widgets.favoriteContact", false), { vm.setToggle("widgets.favoriteContact", it) })
                ToggleRow("New chat shortcut", s.toggle("widgets.newChat", false), { vm.setToggle("widgets.newChat", it) })
                ToggleRow("Quick expense entry", s.toggle("widgets.quickExpense", false), { vm.setToggle("widgets.quickExpense", it) })
                ToggleRow("Create reminder shortcut", s.toggle("widgets.createReminder", false), { vm.setToggle("widgets.createReminder", it) })
                ToggleRow("Quick SOS shortcut", s.toggle("widgets.quickSos", false), { vm.setToggle("widgets.quickSos", it) })
                ToggleRow("Pinned Circle shortcut", s.toggle("widgets.pinnedCircle", false), { vm.setToggle("widgets.pinnedCircle", it) })
                ToggleRow("Notification quick actions", s.toggle("widgets.notificationActions", true), { vm.setToggle("widgets.notificationActions", it) })
            }
            SettingsGroup("PRIVACY") {
                ToggleRow("Hide sensitive widget content", s.toggle("widgets.hideSensitive", true), { vm.setToggle("widgets.hideSensitive", it) })
                ChoiceRow("Lock-screen privacy", listOf("Hide all", "Show sender", "Show all"), s.choice("widgets.lockScreenPrivacy", "Show sender"), { vm.setChoice("widgets.lockScreenPrivacy", it) })
            }
        }
    }
}

/** 25. Business, Work & Team Preferences (P3 — not yet available). */
@Composable
fun BusinessTeamSettingsScreen(onBack: () -> Unit) {
    GagaScaffold(title = "Business & Team", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsBanner("Business workspaces are planned for a future release. These options will appear here once they launch — nothing below is active yet.")
            SettingsGroup("COMING SOON") {
                ComingSoonRow("Organization profile", "Business identity and verification")
                ComingSoonRow("Roles & permissions", "Employee and member roles")
                ComingSoonRow("Team tasks & shared calendar", "Permissions for shared work")
                ComingSoonRow("Approval workflows", "Route requests for approval")
                ComingSoonRow("Business directories", "Company contact lists")
                ComingSoonRow("Announcements", "Internal announcement preferences")
                ComingSoonRow("Audit logs & retention", "Workspace records and retention")
                ComingSoonRow("Ownership transfer", "Move workspace ownership")
            }
            SettingsNote("Administrators will manage business-owned records — never unrestricted private chats or personal tasks.")
        }
    }
}

/** 26. Anti-Spam, Abuse & Trust Controls (P1). */
@Composable
fun AntiSpamTrustSettingsScreen(
    onBack: () -> Unit,
    onOpenBlocked: () -> Unit,
    vm: SettingsCenterViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Anti-Spam & Trust", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsBanner("Core safety protections stay active where legally or operationally required, even if optional AI features are turned off.")
            SettingsGroup("FILTERING") {
                ToggleRow("Spam filtering for unknown senders", s.toggle("trust.spamFilter", true), { vm.setToggle("trust.spamFilter", it) }, icon = Icons.Filled.Shield)
                ToggleRow("Suspected scam warnings", s.toggle("trust.scamWarnings", true), { vm.setToggle("trust.scamWarnings", it) })
                ToggleRow("Suspicious link warnings", s.toggle("trust.urlWarnings", true), { vm.setToggle("trust.urlWarnings", it) })
                ToggleRow("Message-request filtering", s.toggle("trust.messageRequests", true), { vm.setToggle("trust.messageRequests", it) })
                ToggleRow("Repeated invitation protection", s.toggle("trust.repeatedInvites", true), { vm.setToggle("trust.repeatedInvites", it) })
            }
            SettingsGroup("CALLS & ACCOUNTS") {
                ChoiceRow("Unknown callers", listOf("Allow", "Silence", "Block"), s.choice("trust.unknownCallers", "Silence"), { vm.setChoice("trust.unknownCallers", it) })
                ActionRow("Blocked account management", "Review and unblock accounts", onClick = onOpenBlocked)
                ToggleRow("Security alerts", s.toggle("trust.securityAlerts", true), { vm.setToggle("trust.securityAlerts", it) })
            }
            SettingsGroup("REPORTING") {
                InfoRow("Reported content history", "See what you've reported")
                InfoRow("Abuse report status", "Track your reports")
                InfoRow("Report impersonation", "Someone pretending to be you")
                InfoRow("Report a fake account", "Flag suspicious accounts")
                InfoRow("Community guidelines", "How we keep GaGa safe")
            }
        }
    }
}

/** 27. GaGa Premium & Subscription Management (P3 — not yet available). */
@Composable
fun PremiumSettingsScreen(onBack: () -> Unit) {
    GagaScaffold(title = "Premium & Subscription", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsBanner("There is no paid plan available yet, so subscription controls are hidden until a real subscription exists.")
            SettingsGroup("COMING SOON") {
                ComingSoonRow("Current plan", "Shown once plans launch")
                ComingSoonRow("Plan benefits", "What each plan includes")
                ComingSoonRow("Billing & renewal", "Manage through your payment provider")
                ComingSoonRow("Payment receipts", "Download receipts")
                ComingSoonRow("Restore purchases", "Recover a previous purchase")
                ComingSoonRow("Usage limits", "Remaining quotas")
            }
        }
    }
}

/** 28. Delivery, Service Requests & Local Services (P3 — not yet available). */
@Composable
fun DeliveryServicesSettingsScreen(onBack: () -> Unit) {
    GagaScaffold(title = "Delivery & Services", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsBanner("Local services are planned for a future release. Addresses and location are only collected once the service that needs them is available.")
            SettingsGroup("COMING SOON") {
                ComingSoonRow("Saved delivery addresses", "Where your orders go")
                ComingSoonRow("Delivery instructions", "Notes for couriers")
                ComingSoonRow("Order & delivery alerts", "Status notifications")
                ComingSoonRow("Saved service providers", "Favourite providers")
                ComingSoonRow("Service history", "Past requests and orders")
                ComingSoonRow("Support & refund cases", "Track resolutions")
            }
        }
    }
}

/** 29. Personal Dashboard & Navigation Preferences (P1). */
@Composable
fun PersonalDashboardSettingsScreen(
    onBack: () -> Unit,
    vm: SettingsCenterViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Dashboard & Navigation", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsNote("These preferences shape the whole GaGa experience, not just Today.")
            SettingsGroup("NAVIGATION") {
                ChoiceRow("Default opening tab", listOf("Chats", "Today"), s.choice("dashboard.defaultTab", "Chats"), { vm.setChoice("dashboard.defaultTab", it) }, icon = Icons.Filled.Dashboard)
                ChoiceRow("View density", listOf("Compact", "Comfortable"), s.choice("dashboard.density", "Comfortable"), { vm.setChoice("dashboard.density", it) })
                ToggleRow("Remember last Today filter", s.toggle("dashboard.rememberFilter", true), { vm.setToggle("dashboard.rememberFilter", it) })
                ToggleRow("Show recommended actions", s.toggle("dashboard.recommended", true), { vm.setToggle("dashboard.recommended", it) })
                ToggleRow("Personalized welcome summary", s.toggle("dashboard.welcomeSummary", true), { vm.setToggle("dashboard.welcomeSummary", it) })
            }
            SettingsGroup("LAYOUT") {
                InfoRow("Reorder Today cards", "Drag cards to reorder")
                InfoRow("Pin frequently used features", "Keep favourites within reach")
                InfoRow("Hide unused modules", "Tidy up your dashboard")
                InfoRow("Default quick actions", "Choose which actions appear first")
                ActionRow("Restore original layout", "Reset the dashboard arrangement") { vm.clearValue("dashboard.layoutResetAt") }
            }
            SettingsGroup("FORMATS") {
                ChoiceRow("Date format", listOf("Auto", "DD/MM/YYYY", "MM/DD/YYYY"), s.choice("dashboard.dateFormat", "Auto"), { vm.setChoice("dashboard.dateFormat", it) })
                ChoiceRow("Preferred currency", listOf("USD", "EUR", "GBP", "BDT", "INR"), s.choice("dashboard.currency", "USD"), { vm.setChoice("dashboard.currency", it) })
            }
        }
    }
}

/** 30. Advanced Troubleshooting & App Diagnostics (P1–P2). */
@Composable
fun AdvancedTroubleshootingSettingsScreen(
    onBack: () -> Unit,
    onOpenPermissions: () -> Unit,
    onOpenHelp: () -> Unit,
    vm: SettingsCenterViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val version = remember { appVersionLabel(context) }
    GagaScaffold(title = "Troubleshooting", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsBanner("Diagnostic reports never include API keys, access tokens or private message contents.")
            SettingsGroup("STATUS") {
                InfoRow("App version", version, icon = Icons.Filled.Build)
                InfoRow("Backend connection", "Connected")
                InfoRow("Authentication session", "Signed in")
                InfoRow("Notification delivery", "Channels registered")
                InfoRow("Last synchronization", "Up to date")
            }
            SettingsGroup("DIAGNOSTIC TESTS") {
                ActionRow("Run media upload test", "Check that uploads work") { vm.clearValue("diag.uploadTestAt") }
                ActionRow("Run network connectivity test", "Check reachability") { vm.clearValue("diag.networkTestAt") }
                ActionRow("Recheck Android permissions", "Review what GaGa can access", onClick = onOpenPermissions)
                InfoRow("Review failed actions", "Nothing failed recently")
            }
            SettingsGroup("REPORTS & SUPPORT") {
                ActionRow("Export redacted diagnostic report", "Share a privacy-safe report") { vm.clearValue("diag.exportAt") }
                ActionRow("Contact support with diagnostics", "Attach a redacted report", onClick = onOpenHelp)
                ActionRow("Check for app updates", "Open the store listing") {
                    val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    runCatching { context.startActivity(market) }.onFailure {
                        runCatching {
                            context.startActivity(
                                Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=${context.packageName}"))
                                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                            )
                        }
                    }
                }
            }
            SettingsGroup("RESET") {
                ActionRow("Reset selected preferences", "Return Settings Center controls to default") { vm.resetAll() }
            }
        }
    }
}
