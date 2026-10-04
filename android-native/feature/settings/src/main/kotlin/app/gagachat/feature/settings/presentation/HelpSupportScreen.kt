package app.gagachat.feature.settings.presentation

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaSettingsRow
import app.gagachat.core.ui.theme.GagaDimens

/**
 * Help & Support (spec section 11 - support completeness).
 *
 * Previously the "Help" entry simply opened the About screen, so there was no
 * actual support surface. This screen provides a self-serve FAQ (the questions
 * that real users hit: ringing, stuck messages, media, contacts, privacy and
 * account deletion), a one-tap way to email support, and shortcuts to the
 * permissions and About screens.
 */
@Composable
fun HelpSupportScreen(
    onBack: () -> Unit,
    onOpenPermissions: () -> Unit,
    onOpenAbout: () -> Unit,
) {
    val context = LocalContext.current
    var expanded by remember { mutableStateOf<Int?>(null) }

    GagaScaffold(title = "Help & Support", onBack = onBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space32),
        ) {
            Text(
                text = "Answers to the most common questions, plus a way to reach us " +
                    "if you're still stuck.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(GagaDimens.space16),
            )

            GagaSectionHeader("FREQUENTLY ASKED QUESTIONS")
            FAQS.forEachIndexed { index, faq ->
                FaqRow(
                    question = faq.question,
                    answer = faq.answer,
                    expanded = expanded == index,
                    onToggle = { expanded = if (expanded == index) null else index },
                )
                GagaDivider()
            }

            GagaSectionHeader("STILL NEED HELP?")
            GagaSettingsRow(
                title = "Contact support",
                subtitle = "Email $SUPPORT_EMAIL \u2014 we usually reply within a day",
                leadingIcon = Icons.Filled.Email,
                leadingIconTint = SupportGreen,
                onClick = { emailSupport(context) },
            )
            GagaDivider()
            GagaSettingsRow(
                title = "App permissions",
                subtitle = "Camera, microphone, notifications and more",
                leadingIcon = Icons.Filled.Apps,
                leadingIconTint = SupportGreen,
                onClick = onOpenPermissions,
            )
            GagaDivider()
            GagaSettingsRow(
                title = "About GaGa Chat",
                subtitle = "Version, legal and open-source licences",
                leadingIcon = Icons.Filled.Info,
                leadingIconTint = SupportGreen,
                onClick = onOpenAbout,
            )
            GagaDivider()
            Spacer(Modifier.height(GagaDimens.space16))
            Text(
                text = "Tip: if calls don't ring when GaGa is closed, allow GaGa Chat to " +
                    "run in the background \u2014 see App permissions \u2192 Background reliability.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(GagaDimens.space16),
            )
        }
    }
}

/** A single expandable FAQ entry: question row + animated answer. */
@Composable
private fun FaqRow(
    question: String,
    answer: String,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggle)
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space12),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = question,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.weight(1f),
            )
            Icon(
                imageVector = if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                contentDescription = if (expanded) "Collapse" else "Expand",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        AnimatedVisibility(visible = expanded) {
            Text(
                text = answer,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = GagaDimens.space8),
            )
        }
    }
}

private data class Faq(val question: String, val answer: String)

private val FAQS = listOf(
    Faq(
        question = "I'm not receiving messages or calls",
        answer = "Open Settings \u2192 App permissions and make sure Notifications is " +
            "allowed. Then check Background reliability: if it says \"Not allowed\", tap " +
            "it and let GaGa Chat run in the background. Some device makers still delay " +
            "background apps, so keep GaGa open when you're expecting an important call.",
    ),
    Faq(
        question = "Calls don't ring when the app is closed",
        answer = "Android limits background apps to save battery. Allowing GaGa Chat to " +
            "run in the background (App permissions \u2192 Background reliability) makes " +
            "ringing much more reliable. No app can guarantee ringing while it is " +
            "force-stopped from the recents screen.",
    ),
    Faq(
        question = "A message is stuck on \"Sending\"",
        answer = "This usually means the connection dropped. Tap the message and choose " +
            "Retry, or simply reopen the chat \u2014 GaGa resends automatically. Sends are " +
            "idempotent, so a retry can never create a duplicate message.",
    ),
    Faq(
        question = "Photos or videos won't send",
        answer = "Check that Photos & media is allowed in App permissions. Uploads " +
            "continue in the background, so you can leave the chat \u2014 the message will " +
            "finish sending on its own once you're back online.",
    ),
    Faq(
        question = "How do I add someone?",
        answer = "Open the People tab and search by name, username, email, phone or GaGa " +
            "ID. You can also share your QR code from Me \u2192 My QR Code, or scan theirs. " +
            "Contacts access is optional \u2014 it just makes finding friends faster.",
    ),
    Faq(
        question = "How do I free up storage?",
        answer = "Open Settings \u2192 Data & Storage and tap Clear media cache. You can also " +
            "set media to auto-download on Wi-Fi only, or never, to save data.",
    ),
    Faq(
        question = "Is my data private?",
        answer = "Messages and calls are encrypted in transit, and your sign-in tokens " +
            "are stored encrypted on the device \u2014 GaGa Chat never keeps your password. " +
            "You can review your choices under Settings \u2192 Privacy.",
    ),
    Faq(
        question = "How do I delete my account?",
        answer = "Open Settings \u2192 Delete account. This permanently removes your profile, " +
            "messages, media, friends and call history, and signs you out everywhere. It " +
            "cannot be undone.",
    ),
)

/** Opens the user's mail app addressed to support. */
internal fun emailSupport(context: Context) {
    val intent = Intent(Intent.ACTION_SENDTO).apply {
        data = Uri.parse("mailto:$SUPPORT_EMAIL")
        putExtra(Intent.EXTRA_SUBJECT, "GaGa Chat support")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    runCatching { context.startActivity(intent) }
}

internal const val SUPPORT_EMAIL = "support@gagachat.app"

// Single brand green for non-destructive leading icons (spec section 1).
private val SupportGreen = Color(0xFF00C300)
