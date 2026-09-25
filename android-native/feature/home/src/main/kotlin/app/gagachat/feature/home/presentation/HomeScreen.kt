package app.gagachat.feature.home.presentation

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaEmptyState
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSearchBar
import app.gagachat.core.ui.theme.GagaDimens

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeRoute(
    onOpenConversation: (conversationId: String) -> Unit,
    onOpenNewChat: () -> Unit,
    onOpenMore: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeError()
        }
    }

    GagaScaffold(
        title = "GaGa Chat",
        snackbarHostState = snackbarHostState,
        actions = {
            IconButton(onClick = onOpenMore) {
                Icon(Icons.Filled.MoreVert, contentDescription = "More")
            }
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onOpenNewChat) {
                Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = "New chat")
            }
        },
    ) { padding ->
        androidx.compose.foundation.layout.Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            GagaSearchBar(
                query = state.query,
                onQueryChange = viewModel::onQueryChange,
                placeholder = "Search conversations",
            )
            when {
                state.isLoading && state.conversations.isEmpty() -> GagaLoading()
                state.conversations.isEmpty() -> GagaEmptyState(
                    icon = Icons.Filled.ChatBubbleOutline,
                    title = if (state.query.isBlank()) "No conversations yet" else "No matches",
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
                            )
                        }
                    }
                }
            }
        }
    }
}
