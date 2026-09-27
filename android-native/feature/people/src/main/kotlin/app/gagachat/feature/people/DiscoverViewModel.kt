package app.gagachat.feature.people

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.model.User
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DiscoverUiState(
    val query: String = "",
    val results: List<User> = emptyList(),
    val isSearching: Boolean = false,
    val friendIds: Set<String> = emptySet(),
    val sentIds: Set<String> = emptySet(),
    val error: String? = null,
    val searched: Boolean = false,
)

@HiltViewModel
class DiscoverViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val friendsRepository: FriendsRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(DiscoverUiState())
    val state: StateFlow<DiscoverUiState> = _state.asStateFlow()

    private var searchJob: Job? = null

    init {
        // Seed friend ids so we can render "Already friends" without a round-trip.
        viewModelScope.launch {
            friendsRepository.friends.collect { friends ->
                _state.update { it.copy(friendIds = friends.map { f -> f.user.id }.toSet()) }
            }
        }
        // Make sure the friend set is fresh even if People wasn't opened first.
        viewModelScope.launch { runCatching { friendsRepository.refresh() } }
    }

    fun onQueryChange(value: String) {
        _state.update { it.copy(query = value, error = null) }
        searchJob?.cancel()
        if (value.trim().length < 2) {
            _state.update { it.copy(results = emptyList(), isSearching = false, searched = false) }
            return
        }
        searchJob = viewModelScope.launch {
            delay(300) // debounce
            _state.update { it.copy(isSearching = true, error = null) }
            when (val result = userRepository.searchUsersRemote(value)) {
                is AppResult.Success -> {
                    val me = authRepository.sessionFlow.value?.userId
                    _state.update {
                        it.copy(
                            results = result.data.filter { u -> u.id != me },
                            isSearching = false,
                            searched = true,
                        )
                    }
                }
                is AppResult.Failure -> _state.update {
                    it.copy(isSearching = false, error = result.error.toUserMessage(), searched = true)
                }
                AppResult.Loading -> Unit
            }
        }
    }

    fun sendRequest(user: User) {
        viewModelScope.launch {
            when (val result = friendsRepository.sendRequest(user.id)) {
                is AppResult.Success -> _state.update { it.copy(sentIds = it.sentIds + user.id) }
                is AppResult.Failure -> _state.update { it.copy(error = result.error.toUserMessage()) }
                AppResult.Loading -> Unit
            }
        }
    }
}
