package app.gagachat.feature.auth.presentation.welcome

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
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.EventNote
import androidx.compose.material.icons.filled.TaskAlt
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.gagachat.core.ui.component.GagaLogo
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaTextButton
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen
import app.gagachat.core.ui.theme.GagaTeal

/** One of GaGa's three headline advantages shown on the Welcome screen. */
private data class Advantage(
    val icon: ImageVector,
    val tint: Color,
    val title: String,
    val description: String,
)

/**
 * First-run Welcome screen (Master Spec §C — startup journey).
 *
 * The very first thing a brand-new install sees after the OS splash. It states
 * the product promise ("Chat. Organize. Get Things Done."), introduces GaGa's
 * three core advantages, and offers the two entry points into the funnel:
 *  - Get Started → the Introduction tour (then sign-up), and
 *  - I already have an account → straight to Sign In.
 *
 * Purely presentational: all routing is delegated to the caller so the screen
 * stays reusable and testable. Shown exactly once per install (see
 * [app.gagachat.core.data.preferences.AppIntroPreferences]).
 */
@Composable
fun WelcomeRoute(
    onGetStarted: () -> Unit,
    onSignIn: () -> Unit,
) {
    val advantages = listOf(
        Advantage(
            icon = Icons.Filled.ChatBubble,
            tint = GagaGreen,
            title = "Connect with People",
            description = "Message, call and share — one-to-one or in groups, all end-to-end in real time.",
        ),
        Advantage(
            icon = Icons.Filled.EventNote,
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = GagaDimens.space24, vertical = GagaDimens.space32),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(GagaDimens.space16))

        // Hero: soft green halo behind the brand mark.
        Box(contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier
                    .size(200.dp)
                    .clip(RoundedCornerShape(percent = 50))
                    .background(
                        Brush.radialGradient(
                            colors = listOf(
                                GagaGreen.copy(alpha = 0.22f),
                                Color.Transparent,
                            ),
                        ),
                    ),
            )
            GagaLogo(size = 112.dp, elevation = 12.dp)
        }

        Spacer(Modifier.height(GagaDimens.space16))

        Text(
            text = "GaGa",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.ExtraBold,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(GagaDimens.space4))
        Text(
            text = "Chat. Organize. Get Things Done.",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(GagaDimens.space8))
        Text(
            text = "Your conversations, your plans and your to-dos — together in one place.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )

        Spacer(Modifier.height(GagaDimens.space32))

        advantages.forEach { advantage ->
            AdvantageRow(advantage)
            Spacer(Modifier.height(GagaDimens.space12))
        }

        Spacer(Modifier.height(GagaDimens.space16))

        GagaPrimaryButton(
            text = "Get Started",
            onClick = onGetStarted,
            leadingIcon = Icons.Filled.ArrowForward,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(GagaDimens.space4))
        GagaTextButton(
            text = "I already have an account",
            onClick = onSignIn,
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(GagaDimens.space8))
        Text(
            text = "By continuing you agree to GaGa's Terms of Service and Privacy Policy.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun AdvantageRow(advantage: Advantage) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(GagaDimens.space16),
        verticalAlignment = Alignment.CenterVertically,
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
        Spacer(Modifier.width(GagaDimens.space16))
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
