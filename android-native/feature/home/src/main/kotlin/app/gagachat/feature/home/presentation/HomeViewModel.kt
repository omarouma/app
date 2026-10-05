package app.gagachat.feature.home.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.network.NetworkMonitor
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.NotificationRepository
import app.gagachat.core.model.Conversation
import app.gagachat.core.model.ConversationType
import app.gagachat.core.ui.util.toUserMessageOrNull
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Top-level filter tabs on the Chats screen (spec §4: All, Unread, Groups). */
enum class ConversationFilter { ALL, UNREAD, GROUPS }

data class HomeUiState(
    val conversations: List<Conversation> = emptyList(),
    val query: String = "",
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
    val currentUserId: String = "",
    val filter: ConversationFilter = ConversationFilter.ALL,
    val isOnline: Boolean = true,
    val archivedCount: Int = 0,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val authRepository: AuthRepository,
    private val notificationRepository: NotificationRepository,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    /** Unread in-app notification count, surfaced as a bell badge on Home. */
    val unreadNotifications: StateFlow<Int> = notificationRepository.unreadCount

    private val query = MutableStateFlow("")
    private val loading = MutableStateFlow(true)
    private val refreshing = MutableStateFlow(false)
    private val error = MutableStateFlow<String?>(null)
    private val filter = MutableStateFlow(ConversationFilter.ALL)

    /**
     * Query + session + active filter, folded into one bundle so the outer
     * `combine` stays within the 5-argument overload while still reacting to
     * sign-in / sign-out and tab changes.
     */
    private data class Controls(
        val query: String,
        val currentUserId: String,
        val filter: ConversationFilter,
    )

    /** Loading/refresh/error/connectivity/archived-count bundle for the same reason. */
    private data class Meta(
        val isLoading: Boolean,
        val isRefreshing: Boolean,
        val errorMessage: String?,
        val isOnline: Boolean,
        val archivedCount: Int,
    )

    private val controls: Flow<Controls> = combine(
        query,
        authRepository.sessionFlow,
        filter,
    ) { q, session, f -> Controls(q, session?.userId.orEmpty(), f) }

    private val meta: Flow<Meta> = combine(
        loading,
        refreshing,
        error,
        networkMonitor.isOnline,
        conversationRepository.observeArchivedCount(),
    ) { isLoading, isRefreshing, errorMessage, isOnline, archivedCount ->
        Meta(isLoading, isRefreshing, errorMessage, isOnline, archivedCount)
    }

    val state: StateFlow<HomeUiState> = combine(
        conversationRepository.observeConversations(),
        controls,
        meta,
    ) { conversations, controls, meta ->
        val me = controls.currentUserId
        val searched = if (controls.query.isBlank()) {
            conversations
        } else {
            conversations.filter { it.displayTitle(me).contains(controls.query, ignoreCase = true) }
        }
        val filtered = when (controls.filter) {
            ConversationFilter.ALL -> searched
            ConversationFilter.UNREAD -> searched.filter { it.unreadCount > 0 }
            ConversationFilter.GROUPS -> searched.filter { it.type != ConversationType.DIRECT }
        }
        HomeUiState(
            conversations = filtered.sortedWith(
                compareByDescending<Conversation> { it.isPinned }
                    .thenByDescending { it.lastMessageAt ?: it.updatedAt },
            ),
            query = controls.query,
            isLoading = meta.isLoading,
            isRefreshing = meta.isRefreshing,
            errorMessage = meta.errorMessage,
            currentUserId = me,
            filter = controls.filter,
            isOnline = meta.isOnline,
            archivedCount = meta.archivedCount,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HomeUiState())

    init {
        // Local-first: cached rows render immediately; sync runs in background.
        viewModelScope.launch {
            loading.value = false
            sync()
        }
        // Populate the notification bell badge without blocking the chat list.
        viewModelScope.launch { runCatching { notificationRepository.refresh() } }
    }

    fun onQueryChange(value: String) {
        query.value = value
    }

    fun onFilterChange(value: ConversationFilter) {
        filter.value = value
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

    /** Archive/unarchive a conversation (spec §4). */
    fun onToggleArchive(conversation: Conversation) {
        viewModelScope.launch {
            conversationRepository.setArchived(conversation.id, !conversation.isArchived)
        }
    }

    /** Clear the unread badge for a conversation. */
    fun onMarkRead(conversation: Conversation) {
        viewModelScope.launch {
            conversationRepository.markRead(conversation.id, conversation.lastMessageId.orEmpty())
        }
    }

    /** Flag a conversation as unread using a sentinel badge (distinct from receipts). */
    fun onMarkUnread(conversation: Conversation) {
        viewModelScope.launch {
            conversationRepository.markUnread(conversation.id)
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
            is AppResult.Failure -> error.value = result.error.toUserMessageOrNull(networkMonitor.isCurrentlyOnline())
            else -> Unit
        }
        refreshing.value = false
    }
}
