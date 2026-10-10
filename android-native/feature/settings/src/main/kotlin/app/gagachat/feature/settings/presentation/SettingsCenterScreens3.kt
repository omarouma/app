package app.gagachat.feature.settings.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.theme.GagaDimens

/*
 * Settings Center V2.0 — release-essential categories that were previously only
 * reachable from inside their feature modules (Chats & Messaging, Calls).
 */

/** 4. Chats & Messaging defaults (account-wide). */
@Composable
fun ChatsMessagingSettingsScreen(
    onBack: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenStorage: () -> Unit,
    onOpenAppearance: () -> Unit,
    vm: SettingsCenterViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Chats & Messaging", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsNote("These are account-wide messaging defaults. Individual chats can override some of them.")
            SettingsGroup("SENDING") {
                ToggleRow("Enter key sends message", s.toggle("chats.enterToSend", true), { vm.setToggle("chats.enterToSend", it) }, icon = Icons.AutoMirrored.Filled.Chat)
                ToggleRow("Typing indicator", s.toggle("chats.typingIndicator", true), { vm.setToggle("chats.typingIndicator", it) })
                ToggleRow("Link previews", s.toggle("chats.linkPreviews", true), { vm.setToggle("chats.linkPreviews", it) })
                ToggleRow("Auto-translate incoming messages", s.toggle("chats.autoTranslate", false), { vm.setToggle("chats.autoTranslate", it) })
            }
            SettingsGroup("MEDIA") {
                ToggleRow("Save received media to gallery", s.toggle("chats.saveToGallery", false), { vm.setToggle("chats.saveToGallery", it) })
                ActionRow("Media auto-download", "Control when media downloads", onClick = onOpenStorage)
            }
            SettingsGroup("HISTORY & PRIVACY") {
                ChoiceRow("Default disappearing messages", listOf("Off", "24 hours", "7 days", "90 days"), s.choice("chats.disappearingDefault", "Off"), { vm.setChoice("chats.disappearingDefault", it) })
                ActionRow("Read receipts & last seen", "Managed in Privacy", onClick = onOpenPrivacy)
                ActionRow("Chat wallpaper", "Choose a chat background", onClick = onOpenAppearance)
                InfoRow("Chat backup", "Included in Backup & Restore")
            }
        }
    }
}

/** 9. Calls defaults. */
@Composable
fun CallsSettingsScreen(
    onBack: () -> Unit,
    vm: SettingsCenterViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Calls", onBack = onBack) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            SettingsGroup("CALL HANDLING") {
                ChoiceRow("Unknown callers", listOf("Allow", "Silence", "Block"), s.choice("calls.unknownCallers", "Silence"), { vm.setChoice("calls.unknownCallers", it) }, icon = Icons.Filled.Call)
                ToggleRow("Call waiting", s.toggle("calls.callWaiting", true), { vm.setToggle("calls.callWaiting", it) })
                ToggleRow("Missed-call follow-ups", s.toggle("calls.missedFollowUp", true), { vm.setToggle("calls.missedFollowUp", it) }, subtitle = "Offer a quick reply or callback")
                ToggleRow("Network quality warnings", s.toggle("calls.qualityWarnings", true), { vm.setToggle("calls.qualityWarnings", it) })
            }
            SettingsGroup("AUDIO ROUTING") {
                ChoiceRow("Bluetooth behavior", listOf("Automatic", "Ask each call", "Phone only"), s.choice("calls.bluetooth", "Automatic"), { vm.setChoice("calls.bluetooth", it) })
                ChoiceRow("Default speaker", listOf("Earpiece", "Speaker", "Bluetooth"), s.choice("calls.speakerDefault", "Earpiece"), { vm.setChoice("calls.speakerDefault", it) })
            }
            SettingsGroup("DIAGNOSTICS") {
                InfoRow("Call data statistics", "Minutes, data used and quality")
                ActionRow("Call diagnostics", "Check microphone, speaker and network") { vm.clearValue("calls.diagAt") }
            }
        }
    }
}
