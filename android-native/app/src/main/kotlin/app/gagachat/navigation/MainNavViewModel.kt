package app.gagachat.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.repository.CallRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.model.CallStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/**
 * Backs the bottom navigation badges so each tab can surface its own pending
 * signal without the user opening it:
 *  - Chats   → total unread messages across every conversation.
 *  - People  → incoming friend requests awaiting a decision.
 *  - Calls   → missed inbound calls.
 *
 * Every value is derived from a Room-backed repository flow, so the badges stay
 * in sync with the local cache the instant it changes.
 */
@HiltViewModel
class MainNavViewModel @Inject constructor(
    conversationRepository: ConversationRepository,
    friendsRepository: FriendsRepository,
    callRepository: CallRepository,
) : ViewModel() {

    val totalUnread: StateFlow<Int> = conversationRepository.observeConversations()
        .map { conversations -> conversations.sumOf { it.unreadCount } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    /** Incoming friend requests awaiting a decision (People tab). */
    val pendingRequests: StateFlow<Int> = friendsRepository.incomingRequests
        .map { it.size }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    /** Missed inbound calls (Calls tab). */
    val missedCalls: StateFlow<Int> = callRepository.observeHistory()
        .map { calls -> calls.count { !it.isOutgoing && it.status == CallStatus.MISSED } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)
}
