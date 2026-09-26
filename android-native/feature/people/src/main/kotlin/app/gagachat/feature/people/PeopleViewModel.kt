package app.gagachat.feature.people

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.BlockRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.model.Friend
import app.gagachat.core.model.FriendRequest
import app.gagachat.core.model.User
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Aggregated payload for the People screen (Master Spec §C). */
data class PeopleData(
    val friends: List<Friend> = emptyList(),
    val incoming: List<FriendRequest> = emptyList(),
    val outgoing: List<FriendRequest> = emptyList(),
    val blocked: List<User> = emptyList(),
) {
    val isEmpty: Boolean get() = friends.isEmpty() && incoming.isEmpty() && outgoing.isEmpty()
}

@HiltViewModel
class PeopleViewModel @Inject constructor(
    private val friendsRepository: FriendsRepository,
    private val conversationRepository: ConversationRepository,
    private val blockRepository: BlockRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<ScreenState<PeopleData>>(ScreenState.Initial)
    val state: StateFlow<ScreenState<PeopleData>> = _state.asStateFlow()

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _blocked = MutableStateFlow<List<User>>(emptyList())

    private var loaded = false

    init {
        viewModelScope.launch {
            combine(
                friendsRepository.friends,
                friendsRepository.incomingRequests,
                friendsRepository.outgoingRequests,
                _blocked,
            ) { friends, incoming, outgoing, blocked ->
                PeopleData(friends, incoming, outgoing, blocked)
            }
                .collect { data ->
                    _state.value = when {
                        !data.isEmpty -> ScreenState.Content(data)
                        loaded -> ScreenState.Empty
                        else -> _state.value // keep Loading until first refresh resolves
                    }
                }
        }
        refresh()
    }

    fun onQueryChange(value: String) {
        _query.value = value
    }

    fun refresh() {
        viewModelScope.launch {
            if (!loaded) _state.value = ScreenState.Loading
            when (val result = friendsRepository.refresh()) {
                is AppResult.Success -> loaded = true
                is AppResult.Failure -> if (!loaded) {
                    _state.value = ScreenState.Error(result.error.toUserMessage(), retryable = true)
                }
                AppResult.Loading -> Unit
            }
            // Blocked users are loaded alongside friends so the Blocked tab is
            // populated without a second round-trip when the user opens it.
            runCatching {
                blockRepository.refresh()
                _blocked.value = blockRepository.resolveUsers()
            }
        }
    }

    fun accept(request: FriendRequest) = viewModelScope.launch {
        friendsRepository.acceptRequest(request.id, request.fromUserId)
    }

    fun decline(request: FriendRequest) = viewModelScope.launch {
        friendsRepository.declineRequest(request.id)
    }

    fun cancel(request: FriendRequest) = viewModelScope.launch {
        friendsRepository.cancelRequest(request.id)
    }

    fun removeFriend(friend: Friend) = viewModelScope.launch {
        friendsRepository.removeFriend(friend.user.id)
    }

    fun unblock(userId: String) = viewModelScope.launch {
        blockRepository.unblock(userId)
        _blocked.value = blockRepository.resolveUsers()
    }

    /** Opens (or creates) the direct conversation with [otherUserId] then invokes [onReady]. */
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
