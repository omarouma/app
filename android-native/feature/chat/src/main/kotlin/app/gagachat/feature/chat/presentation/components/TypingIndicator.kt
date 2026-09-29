package app.gagachat.feature.chat.presentation.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaTheme
import app.gagachat.core.ui.theme.IncomingBubbleShape

/**
 * Ephemeral typing indicator (PDF §6 — typing state is never persisted, only
 * broadcast over the realtime channel). Rendered as an incoming-style bubble
 * with the peer's avatar (Phase 8.1) so it reads as a real message in progress.
 */
@Composable
fun TypingIndicator(
    modifier: Modifier = Modifier,
    avatarUrl: String? = null,
    name: String? = null,
) {
    Row(
        modifier = modifier.padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space4),
        verticalAlignment = Alignment.Bottom,
    ) {
        GagaAvatar(
            imageUrl = avatarUrl,
            name = name,
            size = GagaDimens.avatarSmall,
        )
        Spacer(Modifier.width(GagaDimens.space8))
        Surface(
            color = GagaTheme.extraColors.incomingBubble,
            contentColor = MaterialTheme.colorScheme.onSurface,
            shape = IncomingBubbleShape,
        ) {
            Row(
                modifier = Modifier
                    .widthIn(min = 52.dp)
                    .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space12),
                horizontalArrangement = Arrangement.spacedBy(GagaDimens.space4),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val transition = rememberInfiniteTransition(label = "typing")
                repeat(3) { index ->
                    val alpha by transition.animateFloat(
                        initialValue = 0.3f,
                        targetValue = 1f,
                        animationSpec = infiniteRepeatable(
                            animation = tween(durationMillis = 600, delayMillis = index * 150),
                            repeatMode = RepeatMode.Reverse,
                        ),
                        label = "dot$index",
                    )
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .alpha(alpha)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onSurfaceVariant),
                    )
                }
            }
        }
    }
}
