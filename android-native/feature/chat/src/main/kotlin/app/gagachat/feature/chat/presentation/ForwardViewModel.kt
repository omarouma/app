package app.gagachat.feature.chat.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.MessageRepository
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.model.Conversation
import app.gagachat.core.model.Message
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * F14: backs the "Forward to…" recipient picker.
 *
 * Previously "Forward" silently re-sent the message into the *current*
 * conversation, which is useless. This exposes the user's conversation list and
 * forwards the source message into whichever chat the user selects.
 */
@HiltViewModel
class ForwardViewModel @Inject constructor(
    conversationRepository: ConversationRepository,
    private val messageRepository: MessageRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    val conversations: StateFlow<List<Conversation>> =
        conversationRepository.observeConversations()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val currentUserId: String
        get() = authRepository.sessionFlow.value?.userId.orEmpty()

    fun forward(message: Message, conversationId: String, onError: (String) -> Unit = {}, onDone: () -> Unit) {
        viewModelScope.launch {
            val session = authRepository.sessionFlow.value
            val result = messageRepository.forwardMessage(
                source = message,
                conversationId = conversationId,
                senderId = session?.userId.orEmpty(),
                senderName = session?.displayName,
                senderAvatar = null,
            )
            if (result is AppResult.Failure) onError("Could not forward this message. Check the destination chat before retrying.")
            else onDone()
        }
    }
}
