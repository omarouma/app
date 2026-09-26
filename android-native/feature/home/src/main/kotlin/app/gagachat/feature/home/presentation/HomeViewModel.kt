package app.gagachat.feature.home.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.model.Conversation
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val conversations: List<Conversation> = emptyList(),
    val query: String = "",
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
    val currentUserId: String = "",
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val query = MutableStateFlow("")
    private val loading = MutableStateFlow(true)
    private val refreshing = MutableStateFlow(false)
    private val error = MutableStateFlow<String?>(null)

    // Fold the session into the query stream so we stay within the 5-arg
    // combine overload while still reacting to sign-in / sign-out.
    private val queryWithSession = combine(query, authRepository.sessionFlow) { q, session ->
        q to session?.userId.orEmpty()
    }

    val state: StateFlow<HomeUiState> = combine(
        conversationRepository.observeConversations(),
        queryWithSession,
        loading,
        refreshing,
        error,
    ) { conversations, (q, me), isLoading, isRefreshing, errorMessage ->
        val filtered = if (q.isBlank()) {
            conversations
        } else {
            conversations.filter { it.displayTitle(me).contains(q, ignoreCase = true) }
        }
        HomeUiState(
            conversations = filtered.sortedWith(
                compareByDescending<Conversation> { it.isPinned }
                    .thenByDescending { it.lastMessageAt ?: it.updatedAt },
            ),
            query = q,
            isLoading = isLoading,
            isRefreshing = isRefreshing,
            errorMessage = errorMessage,
            currentUserId = me,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HomeUiState())

    init {
        // Local-first: cached rows render immediately; sync runs in background.
        viewModelScope.launch {
            loading.value = false
            sync()
        }
    }

    fun onQueryChange(value: String) {
        query.value = value
    }

    fun refresh() {
        viewModelScope.launch { sync(isPullToRefresh = true) }
    }

    fun consumeError() = error.update { null }

    /** Pin/unpin a conversation (also mirrored to the server). */
    fun onTogglePin(conversation: Conversation) {
        viewModelScope.launch {
            conversationRepository.setPinned(conversation.id, !conversation.isPinned)
        }
    }

    /** Mute/unmute a conversation. */
    fun onToggleMute(conversation: Conversation) {
        viewModelScope.launch {
            conversationRepository.setMuted(conversation.id, !conversation.isMuted)
        }
    }

    /** Clear the unread badge for a conversation. */
    fun onMarkRead(conversation: Conversation) {
        viewModelScope.launch {
            conversationRepository.markRead(conversation.id, conversation.lastMessageId.orEmpty())
        }
    }

    /** Delete a conversation locally and on the server. */
    fun onDelete(conversation: Conversation) {
        viewModelScope.launch {
            conversationRepository.deleteConversation(conversation.id)
        }
    }

    private suspend fun sync(isPullToRefresh: Boolean = false) {
        if (isPullToRefresh) refreshing.value = true
        when (val result = conversationRepository.syncConversations()) {
            is AppResult.Failure -> error.value = result.error.toUserMessage()
            else -> Unit
        }
        refreshing.value = false
    }
}
