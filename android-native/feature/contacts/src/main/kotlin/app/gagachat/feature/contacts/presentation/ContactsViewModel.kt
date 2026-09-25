package app.gagachat.feature.contacts.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.model.User
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ContactsUiState(
    val query: String = "",
    val contacts: List<User> = emptyList(),
    val isLoading: Boolean = false,
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class ContactsViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val conversationRepository: ConversationRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val query = MutableStateFlow("")

    val state: StateFlow<ContactsUiState> = query
        .flatMapLatest { q -> userRepository.searchUsers(q).map { q to it } }
        .map { (q, users) -> ContactsUiState(query = q, contacts = users) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ContactsUiState())

    fun onQueryChange(value: String) {
        query.value = value
    }

    /**
     * Resolves (or creates) the direct conversation with [otherUserId] and hands
     * the conversation id back via [onReady] so the caller can navigate to chat.
     * Matches the People surface behaviour (Master Spec §C).
     */
    fun openChat(otherUserId: String, onReady: (String) -> Unit) {
        val me = authRepository.sessionFlow.value?.userId
        if (me.isNullOrBlank()) return
        viewModelScope.launch {
            when (val result = conversationRepository.openDirectConversation(me, otherUserId)) {
                is AppResult.Success -> onReady(result.data)
                else -> Unit
            }
        }
    }
}
