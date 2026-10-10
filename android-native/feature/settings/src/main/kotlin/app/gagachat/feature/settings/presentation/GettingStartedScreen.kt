package app.gagachat.feature.settings.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.automirrored.filled.EventNote
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.TaskAlt
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen
import app.gagachat.core.ui.theme.GagaTeal

/** One of GaGa's three headline advantages, re-surfaced from the first-run intro. */
private data class Advantage(
    val icon: ImageVector,
    val tint: Color,
    val title: String,
    val description: String,
)

/**
 * "Getting started" — a permanent home for the first-run introduction
 * (Master Spec §C). The Welcome + Introduction screens are shown exactly once
 * per install; this screen lets anyone revisit the same three advantages and a
 * handful of quick tips at any time, straight from Settings → Help & About.
 *
 * Purely presentational and self-contained, so it adds no new state or network
 * surface — it simply mirrors the onboarding story inside the app.
 */
@Composable
fun GettingStartedScreen(onBack: () -> Unit) {
    val advantages = listOf(
        Advantage(
            icon = Icons.Filled.ChatBubble,
            tint = GagaGreen,
            title = "Connect with People",
            description = "Message, call and share — one-to-one or in groups, all end-to-end in real time.",
        ),
        Advantage(
            icon = Icons.AutoMirrored.Filled.EventNote,
            tint = GagaTeal,
            title = "Organize Daily Life",
            description = "Turn chats into tasks, events, reminders, budgets and lists — your day, sorted.",
        ),
        Advantage(
            icon = Icons.Filled.TaskAlt,
            tint = Color(0xFF7E57C2),
            title = "Get Things Done",
            description = "Split bills, check in safe, and track everything without leaving the conversation.",
        ),
    )
    val tips = listOf(
        "Start a chat from the Chats tab — tap the compose button, or add someone from People.",
        "Long-press any message to turn it into a task, reminder or event on your Today screen.",
        "Open the Today tab each morning for a briefing of everything that needs your attention.",
        "Everything about your account — privacy, security, notifications and data — lives in Settings.",
    )

    GagaScaffold(title = "Getting started", onBack = onBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
        ) {
            Spacer(Modifier.height(GagaDimens.space8))
            Text(
                text = "Chat. Organize. Get Things Done.",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(GagaDimens.space4))
            Text(
                text = "Your conversations, your plans and your to-dos — together in one place. " +
                    "Here's the quick tour again, whenever you need it.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(GagaDimens.space20))

            advantages.forEach { advantage ->
                AdvantageCard(advantage)
                Spacer(Modifier.height(GagaDimens.space12))
            }

            Spacer(Modifier.height(GagaDimens.space8))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Lightbulb, contentDescription = null, tint = GagaGreen)
                Spacer(Modifier.width(GagaDimens.space8))
                Text(
                    text = "Quick tips",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(GagaDimens.space8))
            tips.forEach { tip ->
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = GagaDimens.space4)) {
                    Text(
                        text = "•",
                        style = MaterialTheme.typography.bodyMedium,
                        color = GagaGreen,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.width(GagaDimens.space8))
                    Text(
                        text = tip,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }

            Spacer(Modifier.height(GagaDimens.space32))
        }
    }
}

@Composable
private fun AdvantageCard(advantage: Advantage) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .padding(GagaDimens.space16),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(GagaDimens.space16),
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(advantage.tint.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = advantage.icon,
                contentDescription = null,
                tint = advantage.tint,
                modifier = Modifier.size(GagaDimens.iconMedium),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = advantage.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(GagaDimens.space2))
            Text(
                text = advantage.description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
