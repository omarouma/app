package app.gagachat.feature.onboarding

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
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen
import app.gagachat.core.ui.theme.GagaTeal

private data class Recap(val icon: ImageVector, val tint: Color, val text: String)

/**
 * Final onboarding step (Master Spec §C): the "Welcome to GaGa!" celebration.
 *
 * The payoff screen that closes the ~1-minute setup loop. It congratulates the
 * user, recaps the three things they can now do (Connect → Organize → Get
 * Things Done) and hands them off to Home with a single "Start chatting" action.
 */
@Composable
fun WelcomeCompleteScreen(
    onFinish: () -> Unit,
) {
    val recaps = listOf(
        Recap(Icons.Filled.ChatBubble, GagaGreen, "Message and call your friends in real time"),
        Recap(Icons.AutoMirrored.Filled.EventNote, GagaTeal, "Turn chats into tasks, events and reminders"),
        Recap(Icons.Filled.TaskAlt, Color(0xFF7E57C2), "Split bills, share location and check in safe"),
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = GagaDimens.space24, vertical = GagaDimens.space32),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier
                    .size(220.dp)
                    .clip(RoundedCornerShape(percent = 50))
                    .background(
                        Brush.radialGradient(
                            colors = listOf(
                                GagaGreen.copy(alpha = 0.24f),
                                Color.Transparent,
                            ),
                        ),
                    ),
            )
            GagaLogo(size = 120.dp, elevation = 14.dp)
        }

        Spacer(Modifier.height(GagaDimens.space24))

        Text(
            text = "Welcome to GaGa!",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.ExtraBold,
            color = MaterialTheme.colorScheme.primary,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(GagaDimens.space8))
        Text(
            text = "You're all set. Here's what you can do right away:",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )

        Spacer(Modifier.height(GagaDimens.space24))

        recaps.forEach { recap ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = GagaDimens.space6),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(recap.tint.copy(alpha = 0.14f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = recap.icon,
                        contentDescription = null,
                        tint = recap.tint,
                        modifier = Modifier.size(GagaDimens.iconSmall),
                    )
                }
                Spacer(Modifier.width(GagaDimens.space12))
                Text(
                    text = recap.text,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        Spacer(Modifier.height(GagaDimens.space32))

        GagaPrimaryButton(
            text = "Start chatting",
            onClick = onFinish,
            leadingIcon = Icons.Filled.ChatBubble,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
