package app.gagachat.feature.settings.presentation

import androidx.compose.ui.text.font.FontWeight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Card
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.background
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonAddAlt1
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.IconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.NotificationCategory
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
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun NotificationInboxScreen(
    onBack: () -> Unit,
    onOpenNotification: (AppNotification) -> Unit,
    onOpenSettings: () -> Unit = {},
    viewModel: NotificationInboxViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val notice by viewModel.notice.collectAsStateWithLifecycle()
    val unread by viewModel.unreadCount.collectAsStateWithLifecycle()
    val hasMore by viewModel.hasMore.collectAsStateWithLifecycle()
    var selected by remember { mutableStateOf(setOf<String>()) }
    var confirmDismiss by remember { mutableStateOf(false) }
    LaunchedEffect(state) {
        val current = (state as? app.gagachat.core.ui.state.ScreenState.Content<List<AppNotification>>)?.data?.map { it.id }?.toSet().orEmpty()
        selected = selected.intersect(current)
    }
    if (confirmDismiss) AlertDialog(
        onDismissRequest = { confirmDismiss = false },
        title = { Text("Dismiss ${selected.size} notifications?") },
        text = { Text("This removes them from your notification inbox. Chats and tasks stay available.") },
        confirmButton = { TextButton(onClick = { viewModel.dismiss(selected.toList()); selected = emptySet(); confirmDismiss = false }) { Text("Dismiss") } },
        dismissButton = { TextButton(onClick = { confirmDismiss = false }) { Text("Keep") } },
    )
    var activeFilter by rememberSaveable { mutableStateOf("All") }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    val filters = NotificationCategory.entries
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(notice) { notice?.let { snackbar.showSnackbar(it); viewModel.consumeNotice() } }

    GagaScaffold(
        title = "Notifications",
        snackbarHostState = snackbar,
        onBack = onBack,
        actions = {
            IconButton(onClick = { viewModel.refresh() }, enabled = !busy) { Icon(Icons.Filled.Refresh, "Refresh notifications") }
            IconButton(onClick = { viewModel.markAllRead() }, enabled = !busy && unread > 0) { Icon(Icons.Filled.DoneAll, "Mark all notifications read") }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
        if (busy) LinearProgressIndicator()
        Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
            Column(Modifier.padding(12.dp)) {
                Text(if (unread == 0) "You're all caught up" else "$unread unread updates", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("Messages, people and plans. Long-press to select.", style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = onOpenSettings) { Text("Notification settings") }
            }
        }
        if (selected.isNotEmpty()) Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = { selected = emptySet() }) { Text("Clear (${selected.size})") }
            TextButton(onClick = { viewModel.markSelectedRead(selected) }, enabled = !busy) { Text("Mark selected read") }
            TextButton(onClick = { confirmDismiss = true }, enabled = !busy) { Text("Dismiss selected") }
        }
        Row(
            modifier = Modifier.fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            filters.forEach { filter ->
                FilterChip(
                    selected = activeFilter == filter.label,
                    onClick = { activeFilter = filter.label },
                    label = { Text(if (filter == NotificationCategory.UNREAD) "Unread ($unread)" else filter.label) },
                )
            }
        }
        app.gagachat.core.ui.component.GagaSearchBar(
            query = searchQuery, onQueryChange = { searchQuery = it.take(120) },
            placeholder = "Search notifications",
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
        GagaStateHost(
            state = state,
            modifier = Modifier.fillMaxSize(),
            onRetry = viewModel::refresh,
            emptyIcon = Icons.Filled.Notifications,
            emptyTitle = "No notifications",
            emptyDescription = "Messages, friend requests and calls will show up here.",
        ) { items ->
            val visible = items.filter { notification ->
                val matchesSearch = searchQuery.isBlank() ||
                    (notification.title?.takeIf { it.isNotBlank() } ?: defaultTitle(notification.type)).contains(searchQuery.trim(), ignoreCase = true) ||
                    notification.body.orEmpty().contains(searchQuery.trim(), ignoreCase = true)
                matchesSearch && (filters.firstOrNull { it.label == activeFilter } ?: NotificationCategory.ALL).matches(notification)
            }
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                if (visible.isEmpty()) item {
                    Text(if (activeFilter == "Unread") "You're all caught up" else "No notifications in this category",
                        Modifier.padding(16.dp))
                }
                val today = LocalDate.now()
                var previousSection: String? = null
                visible.sortedByDescending { it.createdAt }.forEach { notification ->
                    val date = if (notification.createdAt > 0L)
                        Instant.ofEpochMilli(notification.createdAt).atZone(ZoneId.systemDefault()).toLocalDate()
                    else null
                    val section = when (date) {
                        today -> "Today"
                        today.minusDays(1) -> "Yesterday"
                        else -> "Earlier"
                    }
                    if (section != previousSection) {
                        item(key = "section-$section") {
                            Text(section, style = MaterialTheme.typography.titleSmall,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp))
                        }
                        previousSection = section
                    }
                    item(key = notification.id) {
                        Row(Modifier.fillMaxWidth().combinedClickable(
                            onClick = {
                                if (selected.isNotEmpty()) selected = if (notification.id in selected) selected - notification.id else (selected + notification.id).take(100).toSet()
                                else { if (!notification.read) viewModel.markRead(notification.id); onOpenNotification(notification) }
                            },
                            onLongClick = { selected = (selected + notification.id).take(100).toSet() },
                        ), verticalAlignment = Alignment.CenterVertically) {
                            if (selected.isNotEmpty()) Checkbox(checked = notification.id in selected, onCheckedChange = { checked -> selected = if (checked) (selected + notification.id).take(100).toSet() else selected - notification.id })
                            Box(Modifier.weight(1f)) { NotificationRowItem(notification, onClick = null) }
                        }
                    }
                }
                if (hasMore) item(key = "load_older_notifications") {
                    TextButton(onClick = { viewModel.loadMore() }, enabled = !busy, modifier = Modifier.fillMaxWidth().padding(12.dp)) { Text("Load older updates") }
                }
            }
        }
        }
    }
}

@Composable
private fun NotificationRowItem(notification: AppNotification, onClick: (() -> Unit)?) {
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
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = iconFor(notification.type),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
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
                        .background(MaterialTheme.colorScheme.primary),
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
