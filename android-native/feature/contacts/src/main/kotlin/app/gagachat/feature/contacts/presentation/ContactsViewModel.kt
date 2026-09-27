package app.gagachat.feature.contacts.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.model.User
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ContactsUiState(
    val query: String = "",
    val contacts: List<User> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

/**
 * Contacts surface (Master Spec §C). Searches the LOCAL cache instantly and the
 * LIVE `users` table (debounced) so real people appear even before they are
 * cached — previously this only ever read the Room cache and looked empty.
 */
@HiltViewModel
class ContactsViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val conversationRepository: ConversationRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ContactsUiState())
    val state: StateFlow<ContactsUiState> = _state.asStateFlow()

    private var searchJob: Job? = null

    init {
        // Show everything we already know about while the user types.
        viewModelScope.launch {
            runCatching {
                val local = userRepository.searchUsers("").first()
                if (local.isNotEmpty()) {
                    _state.update { it.copy(contacts = merge(it.contacts, local)) }
                }
            }
        }
    }

    fun onQueryChange(value: String) {
        _state.update { it.copy(query = value, error = null) }
        searchJob?.cancel()
        val trimmed = value.trim()
        if (trimmed.isEmpty()) {
            // Fall back to the full local cache.
            viewModelScope.launch {
                runCatching {
                    val local = userRepository.searchUsers("").first()
                    _state.update { it.copy(contacts = local, isLoading = false) }
                }
            }
            return
        }
        searchJob = viewModelScope.launch {
            // Instant local results first.
            runCatching {
                val local = userRepository.searchUsers(trimmed).first()
                _state.update { it.copy(contacts = local) }
            }
            delay(300) // debounce before hitting the network
            _state.update { it.copy(isLoading = true) }
            when (val result = userRepository.searchUsersRemote(trimmed)) {
                is AppResult.Success -> {
                    val me = authRepository.sessionFlow.value?.userId
                    val remote = result.data.filter { it.id != me }
                    _state.update {
                        it.copy(contacts = merge(remote, it.contacts), isLoading = false)
                    }
                }
                is AppResult.Failure -> _state.update {
                    it.copy(isLoading = false, error = result.error.toUserMessage())
                }
                AppResult.Loading -> Unit
            }
        }
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

    /** Remote results take precedence; local entries fill any gaps. */
    private fun merge(primary: List<User>, secondary: List<User>): List<User> {
        val seen = LinkedHashMap<String, User>()
        primary.forEach { seen[it.id] = it }
        secondary.forEach { if (!seen.containsKey(it.id)) seen[it.id] = it }
        return seen.values.toList()
    }
}
