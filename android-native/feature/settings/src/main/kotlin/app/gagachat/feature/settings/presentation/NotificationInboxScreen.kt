package app.gagachat.feature.settings.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonAddAlt1
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.AppNotification
import app.gagachat.core.model.NotificationType
import app.gagachat.core.ui.component.GagaListRow
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.state.GagaStateHost
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen
import app.gagachat.core.ui.theme.GagaGreenContainer
import app.gagachat.core.ui.util.TimeFormat

/**
 * In-app notification inbox (Master Spec §C). Lists real notifications from the
 * LIVE `notifications` table, shows an unread dot per row, and offers a single
 * "Mark all read" action.
 */
@Composable
fun NotificationInboxScreen(
    onBack: () -> Unit,
    viewModel: NotificationInboxViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    GagaScaffold(
        title = "Notifications",
        onBack = onBack,
        actions = {
            TextButton(onClick = viewModel::markAllRead) { Text("Mark all read") }
        },
    ) { padding ->
        GagaStateHost(
            state = state,
            modifier = Modifier.fillMaxSize().padding(padding),
            onRetry = viewModel::refresh,
            emptyIcon = Icons.Filled.Notifications,
            emptyTitle = "No notifications",
            emptyDescription = "Messages, friend requests and calls will show up here.",
        ) { items ->
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(items, key = { it.id }) { notification ->
                    NotificationRowItem(
                        notification = notification,
                        onClick = { viewModel.markRead(notification.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun NotificationRowItem(notification: AppNotification, onClick: () -> Unit) {
    GagaListRow(
        title = notification.title?.takeIf { it.isNotBlank() } ?: defaultTitle(notification.type),
        subtitle = buildString {
            notification.body?.takeIf { it.isNotBlank() }?.let { append(it) }
            if (notification.createdAt > 0L) {
                if (isNotEmpty()) append(" · ")
                append(TimeFormat.conversationTime(notification.createdAt))
            }
        }.ifEmpty { null },
        avatar = {
            Box(
                modifier = Modifier
                    .size(GagaDimens.avatarMedium)
                    .clip(CircleShape)
                    .background(GagaGreenContainer),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = iconFor(notification.type),
                    contentDescription = null,
                    tint = GagaGreen,
                    modifier = Modifier.size(GagaDimens.iconMedium),
                )
            }
        },
        trailing = {
            if (!notification.read) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(GagaGreen),
                )
            }
        },
        onClick = onClick,
    )
}

private fun iconFor(type: NotificationType): ImageVector = when (type) {
    NotificationType.MESSAGE -> Icons.AutoMirrored.Filled.Chat
    NotificationType.FRIEND_REQUEST -> Icons.Filled.PersonAdd
    NotificationType.FRIEND_ACCEPTED -> Icons.Filled.PersonAddAlt1
    NotificationType.CALL -> Icons.Filled.Call
    NotificationType.GROUP_INVITE -> Icons.Filled.Group
    NotificationType.WALLET -> Icons.Filled.AccountBalanceWallet
    NotificationType.SYSTEM -> Icons.Filled.VerifiedUser
}

private fun defaultTitle(type: NotificationType): String = when (type) {
    NotificationType.MESSAGE -> "New message"
    NotificationType.FRIEND_REQUEST -> "Friend request"
    NotificationType.FRIEND_ACCEPTED -> "Friend request accepted"
    NotificationType.CALL -> "Missed call"
    NotificationType.GROUP_INVITE -> "Group invite"
    NotificationType.WALLET -> "Wallet"
    NotificationType.SYSTEM -> "GaGa"
}
