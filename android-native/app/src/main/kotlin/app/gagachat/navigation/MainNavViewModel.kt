package app.gagachat.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.repository.ConversationRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/**
 * Backs the bottom navigation badges. Exposes the total unread message count
 * across every conversation so the Chats tab can show a live badge that stays in
 * sync with the Room-backed conversation list (Master Spec §C — unread sync).
 */
@HiltViewModel
class MainNavViewModel @Inject constructor(
    conversationRepository: ConversationRepository,
) : ViewModel() {

    val totalUnread: StateFlow<Int> = conversationRepository.observeConversations()
        .map { conversations -> conversations.sumOf { it.unreadCount } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)
}
