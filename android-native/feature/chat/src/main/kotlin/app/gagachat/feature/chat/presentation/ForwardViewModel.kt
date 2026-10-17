package app.gagachat.feature.chat.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.MessageRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.model.Conversation
import app.gagachat.core.model.Message
import app.gagachat.core.model.User
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * F14: backs the "Send to\u2026" selector.
 *
 * Surfaces a single, searchable list of destinations \u2014 existing chats (direct,
 * group, channel) plus known contacts who have no chat yet \u2014 lets the user pick
 * one or many, previews exactly what will be sent, and fans the message out on
 * confirmation. Every delivery uses a deterministic idempotency key so a retry
 * or a double-tap can never duplicate a message.
 */
@HiltViewModel
class ForwardViewModel @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val messageRepository: MessageRepository,
    private val userRepository: UserRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val conversations: StateFlow<List<Conversation>> =
        conversationRepository.observeConversations()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val contacts: StateFlow<List<User>> =
        userRepository.searchUsers("")
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val currentUserId: String
        get() = authRepository.sessionFlow.value?.userId.orEmpty()

    /** All selectable destinations (chats first, then contacts), de-duplicated. */
    val destinations: StateFlow<List<ForwardDestination>> =
        combine(conversations, contacts) { convos, people ->
            buildForwardDestinations(convos, people, currentUserId)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _selectedKeys = MutableStateFlow<Set<String>>(emptySet())
    val selectedKeys: StateFlow<Set<String>> = _selectedKeys.asStateFlow()

    private val _sending = MutableStateFlow(false)
    val sending: StateFlow<Boolean> = _sending.asStateFlow()

    fun toggleSelection(key: String) {
        _selectedKeys.update { current ->
            if (key in current) current - key else current + key
        }
    }

    fun clearSelection() {
        _selectedKeys.value = emptySet()
    }

    /**
     * Fans [message] out to every selected destination. Contacts without a chat
     * are resolved (or created) first. Each send uses a deterministic
     * idempotency key, so re-confirming the same selection replaces the same
     * rows instead of duplicating them. The number of successful destinations is
     * reported through [onDone].
     */
    fun send(message: Message, onDone: (Int) -> Unit) {
        val session = authRepository.sessionFlow.value
        val owner = session?.userId.orEmpty()
        if (owner.isBlank() || _sending.value) return
        val chosen = destinations.value.filter { it.key in _selectedKeys.value }
        if (chosen.isEmpty()) return
        _sending.value = true
        viewModelScope.launch {
            var sent = 0
            for (destination in chosen) {
                val conversationId = destination.conversationId
                    ?: destination.userId?.let { otherId ->
                        when (val result = conversationRepository.openDirectConversation(owner, otherId)) {
                            is AppResult.Success -> result.data
                            else -> null
                        }
                    }
                    ?: continue
                val idempotencyKey = forwardIdempotencyKey(message.clientMessageId, destination.key)
                val result = messageRepository.forwardMessage(
                    source = message,
                    conversationId = conversationId,
                    senderId = owner,
                    senderName = session?.displayName,
                    senderAvatar = null,
                    clientMessageId = idempotencyKey,
                )
                if (result is AppResult.Success) sent++
            }
            _sending.value = false
            _selectedKeys.value = emptySet()
            onDone(sent)
        }
    }
}
