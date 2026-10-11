package app.gagachat.feature.people

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.model.FriendRequest
import app.gagachat.core.model.User
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
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
    val incoming: List<FriendRequest> = emptyList(),
    val profileLink: String = "",
    val error: String? = null,
    val searched: Boolean = false,
    val processingIds: Set<String> = emptySet(),
    val notice: String? = null,
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

    fun consumeNotice() { _state.update { it.copy(notice = null) } }

    init {
        // Seed the current user's shareable profile link.
        authRepository.sessionFlow.value?.userId?.let { me ->
            _state.update { it.copy(profileLink = profileLink(me)) }
        }
        // Seed friend ids so we can render "Already friends" without a round-trip.
        viewModelScope.launch {
            friendsRepository.friends.collect { friends ->
                _state.update { it.copy(friendIds = friends.map { f -> f.user.id }.toSet()) }
            }
        }
        // Keep outgoing request status accurate even after reopening the screen.
        viewModelScope.launch {
            friendsRepository.outgoingRequests.collect { requests ->
                _state.update { it.copy(sentIds = requests.map { r -> r.toUserId }.toSet()) }
            }
        }
        // Incoming friend requests power the "Requests" tab.
        viewModelScope.launch {
            friendsRepository.incomingRequests.collect { requests ->
                _state.update { it.copy(incoming = requests) }
            }
        }
        // Make sure the friend set is fresh even if People wasn't opened first.
        viewModelScope.launch { runCatching { friendsRepository.refresh() } }
    }

    /** Public, shareable profile link used by the "Your Profile Link" card. */
    fun profileLink(userId: String): String = "https://gagachat.app/profile/$userId"

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
            when (val result = userRepository.searchUsersRemote(value.trim())) {
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
        val current = _state.value
        if (user.id in current.friendIds || user.id in current.sentIds ||
            user.id in current.processingIds) return
        viewModelScope.launch {
            _state.update { it.copy(processingIds = it.processingIds + user.id) }
            try {
                when (val result = friendsRepository.sendRequest(user.id)) {
                    is AppResult.Success -> _state.update { it.copy(sentIds = it.sentIds + user.id) }
                    is AppResult.Failure -> _state.update { it.copy(notice = result.error.toUserMessage()) }
                    AppResult.Loading -> Unit
                }
            } catch (error: CancellationException) { throw error }
            catch (_: Exception) { _state.update { it.copy(notice = "Could not send friend request.") } }
            finally { _state.update { it.copy(processingIds = it.processingIds - user.id) } }
        }
    }

    fun accept(request: FriendRequest) = changeRequest(request) {
        friendsRepository.acceptRequest(request.id, request.fromUserId)
    }

    fun decline(request: FriendRequest) = changeRequest(request) {
        friendsRepository.declineRequest(request.id)
    }

    private fun changeRequest(
        request: FriendRequest,
        operation: suspend () -> AppResult<Unit>,
    ) {
        if (request.id in _state.value.processingIds) return
        viewModelScope.launch {
            _state.update { it.copy(processingIds = it.processingIds + request.id) }
            try {
                when (val result = operation()) {
                    is AppResult.Success -> Unit
                    is AppResult.Failure -> _state.update { it.copy(notice = result.error.toUserMessage()) }
                    AppResult.Loading -> Unit
                }
            } catch (error: CancellationException) { throw error }
            catch (_: Exception) { _state.update { it.copy(notice = "Couldn't update friend request. Retry.") } }
            finally { _state.update { it.copy(processingIds = it.processingIds - request.id) } }
        }
    }
}
