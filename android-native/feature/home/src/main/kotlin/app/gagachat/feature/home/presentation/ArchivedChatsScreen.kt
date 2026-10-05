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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Unarchive
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.model.Conversation
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaEmptyState
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.util.TimeFormat
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ArchivedChatsUiState(
    val conversations: List<Conversation> = emptyList(),
    val currentUserId: String = "",
)

/** Backs the Archived chats screen (spec §4): lists and restores archived chats. */
@HiltViewModel
class ArchivedChatsViewModel @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    val state: StateFlow<ArchivedChatsUiState> = combine(
        conversationRepository.observeArchivedConversations(),
        authRepository.sessionFlow,
    ) { conversations, session ->
        ArchivedChatsUiState(
            conversations = conversations.sortedByDescending { it.lastMessageAt ?: it.updatedAt },
            currentUserId = session?.userId.orEmpty(),
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ArchivedChatsUiState())

    /** Restore a chat to the main list. */
    fun onUnarchive(conversation: Conversation) {
        viewModelScope.launch { conversationRepository.setArchived(conversation.id, false) }
    }

    /** Delete an archived chat locally and on the server. */
    fun onDelete(conversation: Conversation) {
        viewModelScope.launch { conversationRepository.deleteConversation(conversation.id) }
    }
}

@Composable
fun ArchivedChatsRoute(
    onBack: () -> Unit,
    onOpenConversation: (conversationId: String) -> Unit,
    viewModel: ArchivedChatsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var pendingDelete by remember { mutableStateOf<Conversation?>(null) }

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
        title = "Archived chats",
        onBack = onBack,
        snackbarHostState = snackbarHostState,
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            if (state.conversations.isEmpty()) {
                GagaEmptyState(
                    icon = Icons.Filled.Archive,
                    title = "No archived chats",
                    description = "Chats you archive will appear here.",
                )
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(items = state.conversations, key = { it.id }) { conversation ->
                        ArchivedConversationRow(
                            conversation = conversation,
                            currentUserId = state.currentUserId,
                            onClick = { onOpenConversation(conversation.id) },
                            onUnarchive = { viewModel.onUnarchive(conversation) },
                            onRequestDelete = { pendingDelete = conversation },
                        )
                    }
                }
            }
        }
    }
}

/**
 * A compact archived-chat row: tap opens the chat, swipe left-to-right (or the
 * context menu) restores it to the main list, and the context menu can delete.
 */
@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun ArchivedConversationRow(
    conversation: Conversation,
    currentUserId: String,
    onClick: () -> Unit,
    onUnarchive: () -> Unit,
    onRequestDelete: () -> Unit,
) {
    val title = conversation.displayTitle(currentUserId)
    val other = conversation.otherMember(currentUserId)
    val avatarUrl = conversation.avatar ?: other?.avatar
    var menuExpanded by remember { mutableStateOf(false) }

    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.StartToEnd) onUnarchive()
            // Never let the row leave the list; the action above drives state.
            false
        },
    )

    SwipeToDismissBox(
        state = dismissState,
        enableDismissFromStartToEnd = true,
        enableDismissFromEndToStart = false,
        backgroundContent = {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.secondaryContainer)
                    .padding(horizontal = GagaDimens.space24),
                contentAlignment = Alignment.CenterStart,
            ) {
                Icon(
                    Icons.Filled.Unarchive,
                    contentDescription = "Unarchive",
                    tint = MaterialTheme.colorScheme.onSecondaryContainer,
                )
            }
        },
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
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = conversation.lastMessagePreview ?: "No messages yet",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                conversation.lastMessageAt?.let {
                    Text(
                        text = TimeFormat.conversationTime(it),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                DropdownMenuItem(
                    text = { Text("Unarchive") },
                    leadingIcon = { Icon(Icons.Filled.Unarchive, contentDescription = null) },
                    onClick = { menuExpanded = false; onUnarchive() },
                )
                DropdownMenuItem(
                    text = { Text("Delete") },
                    leadingIcon = { Icon(Icons.Filled.Delete, contentDescription = null) },
                    onClick = { menuExpanded = false; onRequestDelete() },
                )
            }
        }
    }
}
