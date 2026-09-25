package app.gagachat.feature.home.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.gagachat.core.model.Conversation
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaBadge
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.util.TimeFormat

@Composable
fun ConversationRow(
    conversation: Conversation,
    currentUserId: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val title = conversation.displayTitle(currentUserId)
    val other = conversation.otherMember(currentUserId)
    val avatarUrl = conversation.avatar ?: other?.avatar
    val hasUnread = conversation.unreadCount > 0

    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .clickable(onClick = onClick)
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space12),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GagaAvatar(
            imageUrl = avatarUrl,
            name = title,
            size = GagaDimens.avatarLarge,
        )
        Spacer(Modifier.width(GagaDimens.space12))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = if (hasUnread) FontWeight.Bold else FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (conversation.isPinned) {
                    Spacer(Modifier.width(GagaDimens.space4))
                    Icon(
                        Icons.Filled.PushPin,
                        contentDescription = "Pinned",
                        modifier = Modifier.width(GagaDimens.iconSmall),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (conversation.isMuted) {
                    Spacer(Modifier.width(GagaDimens.space4))
                    Icon(
                        Icons.Filled.VolumeOff,
                        contentDescription = "Muted",
                        modifier = Modifier.width(GagaDimens.iconSmall),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.width(GagaDimens.space2))
            Text(
                text = conversation.lastMessagePreview ?: "No messages yet",
                style = MaterialTheme.typography.bodyMedium,
                color = if (hasUnread) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(GagaDimens.space8))
        Column(horizontalAlignment = Alignment.End) {
            conversation.lastMessageAt?.let {
                Text(
                    text = TimeFormat.conversationTime(it),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (hasUnread) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.width(GagaDimens.space4))
            Box {
                GagaBadge(count = conversation.unreadCount)
            }
        }
    }
}
