package app.gagachat.feature.home.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MarkEmailUnread
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.gagachat.core.model.MessageRequest
import app.gagachat.core.network.rest.SupabaseRestApi
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaEmptyState
import app.gagachat.core.ui.component.GagaErrorState
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.theme.GagaDimens
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Backs the Message requests screen (spec §4 / §10): unknown senders whose first
 * message is held back until the recipient accepts, deletes or blocks it.
 */
@HiltViewModel
class MessageRequestsViewModel @Inject constructor(
    private val api: SupabaseRestApi,
) : ViewModel() {

    data class UiState(
        val requests: List<MessageRequest> = emptyList(),
        val isLoading: Boolean = true,
        val errorMessage: String? = null,
        val busyId: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val requests = api.getMessageRequests()
                _state.update { it.copy(requests = requests, isLoading = false) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "Could not load message requests. Retry when connected.",
                    )
                }
            }
        }
    }

    /** Accept, delete or block a request. [action] is one of accept/delete/block. */
    fun respond(id: String, action: String) {
        viewModelScope.launch {
            _state.update { it.copy(busyId = id) }
            try {
                api.respondMessageRequest(id, action)
                val requests = api.getMessageRequests()
                _state.update { it.copy(requests = requests, busyId = null) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _state.update {
                    it.copy(
                        busyId = null,
                        errorMessage = "Could not update request. Retry when connected.",
                    )
                }
            }
        }
    }
}

@Composable
fun MessageRequestsRoute(
    onBack: () -> Unit,
    onOpenConversation: (conversationId: String) -> Unit,
    viewModel: MessageRequestsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    GagaScaffold(title = "Message requests", onBack = onBack) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when {
                state.isLoading -> GagaLoading()
                state.errorMessage != null && state.requests.isEmpty() -> GagaErrorState(
                    title = "Couldn't load requests",
                    description = state.errorMessage,
                    onRetry = viewModel::load,
                )
                state.requests.isEmpty() -> GagaEmptyState(
                    icon = Icons.Filled.MarkEmailUnread,
                    title = "No message requests",
                    description = "Messages from people you don't know will appear here.",
                )
                else -> LazyColumn(modifier = Modifier.fillMaxSize()) {
                    state.errorMessage?.let { error ->
                        item {
                            Text(
                                text = error,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(GagaDimens.space16),
                            )
                        }
                    }
                    items(items = state.requests, key = { it.id }) { request ->
                        MessageRequestCard(
                            request = request,
                            busy = state.busyId == request.id,
                            onAccept = {
                                viewModel.respond(request.id, "accept")
                                onOpenConversation(request.chatId)
                            },
                            onDelete = { viewModel.respond(request.id, "delete") },
                            onBlock = { viewModel.respond(request.id, "block") },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageRequestCard(
    request: MessageRequest,
    busy: Boolean,
    onAccept: () -> Unit,
    onDelete: () -> Unit,
    onBlock: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
    ) {
        Column(modifier = Modifier.padding(GagaDimens.space16)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                GagaAvatar(
                    imageUrl = null,
                    name = request.senderName,
                    size = GagaDimens.avatarMedium,
                )
                Spacer(Modifier.width(GagaDimens.space12))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = request.senderName,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = "Wants to message you",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.height(GagaDimens.space8))
            Text(
                text = request.preview.ifBlank { "(No preview)" },
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(GagaDimens.space8))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(onClick = onBlock, enabled = !busy) { Text("Block") }
                TextButton(onClick = onDelete, enabled = !busy) { Text("Delete") }
                TextButton(onClick = onAccept, enabled = !busy) { Text("Accept") }
            }
        }
    }
}
