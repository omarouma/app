package app.gagachat.feature.home.presentation

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.Conversation
import app.gagachat.core.ui.component.GagaEmptyState
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSearchBar
import app.gagachat.core.ui.theme.GagaDimens
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * Presentation-only filters. Conversation ordering and privacy remain owned by
 * HomeViewModel and ConversationRepository; these tabs never mutate messages.
 */
private enum class ChatInboxFilter(val label: String) {
    ALL("All"),
    UNREAD("Unread"),
    PINNED("Pinned"),
    GROUPS("Groups"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeRoute(
    onOpenConversation: (conversationId: String) -> Unit,
    onOpenNewChat: () -> Unit,
    onOpenNotifications: () -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val unreadNotifications by viewModel.unreadNotifications.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    // Conversation awaiting delete confirmation (opened from the context menu).
    var pendingDelete by remember { mutableStateOf<Conversation?>(null) }
    var currentFilter by rememberSaveable { mutableStateOf(ChatInboxFilter.ALL.name) }

    val visibleConversations = remember(state.conversations, currentFilter) {
        when (currentFilter) {
            ChatInboxFilter.UNREAD.name -> state.conversations.filter { it.unreadCount > 0 }
            ChatInboxFilter.PINNED.name -> state.conversations.filter { it.isPinned }
            ChatInboxFilter.GROUPS.name -> state.conversations.filter { it.type != app.gagachat.core.model.ConversationType.DIRECT }
            else -> state.conversations
        }
    }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeError()
        }
    }

    pendingDelete?.let { conversation ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Delete chat for everyone?") },
            text = {
                Text(
                    "This permanently removes the shared conversation and messages for all participants. " +
                        "This is not the same as archiving or deleting only for yourself. This can't be undone.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.onDelete(conversation) {
                            scope.launch { snackbarHostState.showSnackbar("Conversation deleted") }
                        }
                        pendingDelete = null
                    },
                ) { Text("Delete for everyone") }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("Cancel") }
            },
        )
    }

    GagaScaffold(
        title = "GaGa Chat",
        brandMark = true,
        snackbarHostState = snackbarHostState,
        actions = {
            IconButton(onClick = viewModel::refresh, enabled = !state.isRefreshing) {
                Icon(Icons.Filled.Refresh, "Refresh chats")
            }
            IconButton(onClick = onOpenNotifications) {
                BadgedBox(
                    badge = {
                        if (unreadNotifications > 0) {
                            Badge { Text(if (unreadNotifications > 99) "99+" else "$unreadNotifications") }
                        }
                    },
                ) {
                    Icon(Icons.Filled.Notifications, contentDescription = "Notifications")
                }
            }
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onOpenNewChat) {
                Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = "New chat")
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            GagaSearchBar(
                query = state.query,
                onQueryChange = viewModel::onQueryChange,
                placeholder = "Search names or recent messages",
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space4),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ChatInboxFilter.entries.forEach { filter ->
                    FilterChip(
                        selected = currentFilter == filter.name,
                        onClick = { currentFilter = filter.name },
                        label = { Text(filter.label) },
                    )
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.40f))
            when {
                state.isLoading && state.conversations.isEmpty() -> GagaLoading()
                visibleConversations.isEmpty() -> GagaEmptyState(
                    icon = Icons.Filled.ChatBubbleOutline,
                    title = when {
                        state.query.isNotBlank() -> "No matching conversations"
                        currentFilter == ChatInboxFilter.UNREAD.name -> "You're all caught up"
                        currentFilter == ChatInboxFilter.PINNED.name -> "No pinned chats"
                        currentFilter == ChatInboxFilter.GROUPS.name -> "No group conversations"
                        else -> "No conversations yet"
                    },
                    brandMark = state.query.isBlank() && currentFilter == ChatInboxFilter.ALL.name,
                    description = when {
                        state.query.isNotBlank() -> "Try another name or message preview."
                        currentFilter == ChatInboxFilter.UNREAD.name -> "Unread conversations will appear here."
                        currentFilter == ChatInboxFilter.PINNED.name -> "Long-press a chat to pin it."
                        currentFilter == ChatInboxFilter.GROUPS.name -> "Your group chats will appear here."
                        else -> "Start a new chat to see it here."
                    },
                )
                else -> PullToRefreshBox(
                    isRefreshing = state.isRefreshing,
                    onRefresh = viewModel::refresh,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = GagaDimens.space48),
                    ) {
                        items(
                            items = visibleConversations,
                            key = { it.id },
                        ) { conversation ->
                            ConversationRow(
                                conversation = conversation,
                                currentUserId = state.currentUserId,
                                onClick = { onOpenConversation(conversation.id) },
                                onTogglePin = { viewModel.onTogglePin(conversation) },
                                onToggleMute = { viewModel.onToggleMute(conversation) },
                                onMarkRead = { viewModel.onMarkRead(conversation) },
                                onRequestDelete = { pendingDelete = conversation },
                            )
                        }
                    }
                }
            }
        }
    }
}
