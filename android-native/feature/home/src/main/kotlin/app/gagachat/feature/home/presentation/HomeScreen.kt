package app.gagachat.feature.home.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.MarkEmailUnread
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.Conversation
import app.gagachat.core.ui.component.GagaBadge
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaEmptyState
import app.gagachat.core.ui.component.GagaErrorState
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.core.ui.component.GagaOfflineBanner
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSearchBar
import app.gagachat.core.ui.theme.GagaDimens
import kotlinx.coroutines.launch

/**
 * Chats screen (spec §4).
 *
 * Adds the three top-level filter tabs (All / Unread / Groups), the pinned
 * destination entries for Message requests and Archived chats, an offline
 * banner driven by live connectivity, and a retryable error state — while
 * keeping the local-first list that renders cached rows instantly.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeRoute(
    onOpenConversation: (conversationId: String) -> Unit,
    onOpenNewChat: () -> Unit,
    onOpenNotifications: () -> Unit = {},
    onOpenRequests: () -> Unit = {},
    onOpenArchived: () -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val unreadNotifications by viewModel.unreadNotifications.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    // Conversation awaiting delete confirmation (opened from the context menu).
    var pendingDelete by remember { mutableStateOf<Conversation?>(null) }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeError()
        }
    }

    pendingDelete?.let { conversation ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Delete conversation?") },
            text = {
                Text(
                    "This removes the chat from your device and the server. " +
                        "This can't be undone.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.onDelete(conversation)
                        pendingDelete = null
                        scope.launch { snackbarHostState.showSnackbar("Conversation deleted") }
                    },
                ) { Text("Delete") }
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
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                GagaSearchBar(
                    query = state.query,
                    onQueryChange = viewModel::onQueryChange,
                    placeholder = "Search conversations",
                )
                ConversationFilterTabs(
                    selected = state.filter,
                    onSelect = viewModel::onFilterChange,
                )
                DestinationEntries(
                    archivedCount = state.archivedCount,
                    onOpenRequests = onOpenRequests,
                    onOpenArchived = onOpenArchived,
                )
                when {
                    state.isLoading && state.conversations.isEmpty() -> GagaLoading()
                    state.errorMessage != null && state.conversations.isEmpty() -> GagaErrorState(
                        title = "Couldn't load chats",
                        description = state.errorMessage,
                        onRetry = viewModel::refresh,
                    )
                    state.conversations.isEmpty() -> GagaEmptyState(
                        icon = Icons.Filled.ChatBubbleOutline,
                        title = if (state.query.isBlank()) "No conversations yet" else "No matches",
                        brandMark = state.query.isBlank(),
                        description = if (state.query.isBlank()) {
                            "Start a new chat to see it here."
                        } else {
                            "Try a different search term."
                        },
                    )
                    else -> PullToRefreshBox(
                        isRefreshing = state.isRefreshing,
                        onRefresh = viewModel::refresh,
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        LazyColumn(
                            state = listState,
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(bottom = GagaDimens.space48),
                        ) {
                            items(
                                items = state.conversations,
                                key = { it.id },
                            ) { conversation ->
                                ConversationRow(
                                    conversation = conversation,
                                    currentUserId = state.currentUserId,
                                    onClick = { onOpenConversation(conversation.id) },
                                    onTogglePin = { viewModel.onTogglePin(conversation) },
                                    onToggleMute = { viewModel.onToggleMute(conversation) },
                                    onMarkRead = { viewModel.onMarkRead(conversation) },
                                    onMarkUnread = { viewModel.onMarkUnread(conversation) },
                                    onToggleArchive = { viewModel.onToggleArchive(conversation) },
                                    onRequestDelete = { pendingDelete = conversation },
                                )
                            }
                        }
                    }
                }
            }
            // Floating connectivity banner: slides in from the top whenever the
            // device goes offline, never blocking the cached list underneath.
            GagaOfflineBanner(
                visible = !state.isOnline,
                modifier = Modifier.align(Alignment.TopCenter),
            )
        }
    }
}

/** Human label for each top-level chat filter. */
private fun ConversationFilter.label(): String = when (this) {
    ConversationFilter.ALL -> "All"
    ConversationFilter.UNREAD -> "Unread"
    ConversationFilter.GROUPS -> "Groups"
}

/** All / Unread / Groups segmented filter row (spec §4). */
@Composable
private fun ConversationFilterTabs(
    selected: ConversationFilter,
    onSelect: (ConversationFilter) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space4),
        horizontalArrangement = Arrangement.spacedBy(GagaDimens.space8),
    ) {
        ConversationFilter.entries.forEach { filter ->
            FilterChip(
                selected = selected == filter,
                onClick = { onSelect(filter) },
                label = { Text(filter.label()) },
            )
        }
    }
}

/**
 * Pinned destination entries above the conversation list: Message requests and
 * Archived chats (with a live count badge). These surface secondary inboxes
 * without cluttering the main list.
 */
@Composable
private fun DestinationEntries(
    archivedCount: Int,
    onOpenRequests: () -> Unit,
    onOpenArchived: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        DestinationEntry(
            icon = Icons.Filled.MarkEmailUnread,
            title = "Message requests",
            onClick = onOpenRequests,
        )
        GagaDivider()
        DestinationEntry(
            icon = Icons.Filled.Archive,
            title = "Archived chats",
            badgeCount = archivedCount,
            onClick = onOpenArchived,
        )
        GagaDivider()
    }
}

@Composable
private fun DestinationEntry(
    icon: ImageVector,
    title: String,
    onClick: () -> Unit,
    badgeCount: Int = 0,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space12),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.width(GagaDimens.iconMedium),
        )
        Spacer(Modifier.width(GagaDimens.space12))
        Text(
            text = title,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f),
        )
        GagaBadge(count = badgeCount)
    }
}
