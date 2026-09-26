package app.gagachat.feature.home.presentation

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.gagachat.core.model.Conversation
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaBadge
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.util.TimeFormat

/**
 * A single conversation row on the Home screen.
 *
 * Interactions (reference screenshots 174101 / 174108):
 *  - Tap opens the chat.
 *  - Long-press opens a context menu: Pin/Unpin, Mute/Unmute, Mark as read, Delete.
 *  - Swipe right-to-left deletes the conversation.
 */
@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable
fun ConversationRow(
    conversation: Conversation,
    currentUserId: String,
    onClick: () -> Unit,
    onTogglePin: () -> Unit,
    onToggleMute: () -> Unit,
    onMarkRead: () -> Unit,
    onDelete: () -> Unit,
    onRequestDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val title = conversation.displayTitle(currentUserId)
    val other = conversation.otherMember(currentUserId)
    val avatarUrl = conversation.avatar ?: other?.avatar
    val hasUnread = conversation.unreadCount > 0

    var menuExpanded by remember { mutableStateOf(false) }

    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.EndToStart) {
                onDelete()
                true
            } else {
                false
            }
        },
    )

    SwipeToDismissBox(
        state = dismissState,
        enableDismissFromStartToEnd = false,
        enableDismissFromEndToStart = true,
        backgroundContent = { DeleteBackground() },
        modifier = modifier,
    ) {
        Box {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 72.dp)
                    .background(MaterialTheme.colorScheme.surface)
                    .combinedClickable(
                        onClick = onClick,
                        onLongClick = { menuExpanded = true },
                    )
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
                        color = if (hasUnread) {
                            MaterialTheme.colorScheme.onSurface
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
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
                            color = if (hasUnread) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                    Spacer(Modifier.width(GagaDimens.space4))
                    Box {
                        GagaBadge(count = conversation.unreadCount)
                    }
                }
            }

            ConversationContextMenu(
                expanded = menuExpanded,
                isPinned = conversation.isPinned,
                isMuted = conversation.isMuted,
                hasUnread = hasUnread,
                onDismiss = { menuExpanded = false },
                onTogglePin = { menuExpanded = false; onTogglePin() },
                onToggleMute = { menuExpanded = false; onToggleMute() },
                onMarkRead = { menuExpanded = false; onMarkRead() },
                onDelete = { menuExpanded = false; onRequestDelete() },
            )
        }
    }
}

@Composable
private fun ConversationContextMenu(
    expanded: Boolean,
    isPinned: Boolean,
    isMuted: Boolean,
    hasUnread: Boolean,
    onDismiss: () -> Unit,
    onTogglePin: () -> Unit,
    onToggleMute: () -> Unit,
    onMarkRead: () -> Unit,
    onDelete: () -> Unit,
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        ContextMenuItem(
            label = if (isPinned) "Unpin" else "Pin",
            icon = Icons.Filled.PushPin,
            onClick = onTogglePin,
        )
        ContextMenuItem(
            label = if (isMuted) "Unmute" else "Mute",
            icon = if (isMuted) Icons.Filled.VolumeUp else Icons.Filled.VolumeOff,
            onClick = onToggleMute,
        )
        if (hasUnread) {
            ContextMenuItem(
                label = "Mark as read",
                icon = Icons.Filled.DoneAll,
                onClick = onMarkRead,
            )
        }
        ContextMenuItem(
            label = "Delete",
            icon = Icons.Filled.Delete,
            onClick = onDelete,
        )
    }
}

@Composable
private fun ContextMenuItem(
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
) {
    DropdownMenuItem(
        text = { Text(label) },
        leadingIcon = { Icon(icon, contentDescription = null) },
        onClick = onClick,
    )
}

@Composable
private fun DeleteBackground() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.errorContainer)
            .padding(horizontal = GagaDimens.space24),
        contentAlignment = Alignment.CenterEnd,
    ) {
        Icon(
            Icons.Filled.Delete,
            contentDescription = "Delete",
            tint = MaterialTheme.colorScheme.onErrorContainer,
        )
    }
}
