package app.gagachat.feature.people

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.network.NetworkMonitor
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.BlockRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.preferences.FavoritePeoplePreferences
import app.gagachat.core.model.Friend
import app.gagachat.core.model.FriendRequest
import app.gagachat.core.model.User
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.util.toScreenStateError
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Aggregated payload for the People screen (Master Spec §C). */
data class PeopleData(
    val friends: List<Friend> = emptyList(),
    val incoming: List<FriendRequest> = emptyList(),
    val outgoing: List<FriendRequest> = emptyList(),
    val blocked: List<User> = emptyList(),
) {
    val isEmpty: Boolean get() = friends.isEmpty() && incoming.isEmpty() && outgoing.isEmpty() && blocked.isEmpty()
}

@HiltViewModel
@OptIn(ExperimentalCoroutinesApi::class)
class PeopleViewModel @Inject constructor(
    private val friendsRepository: FriendsRepository,
    private val conversationRepository: ConversationRepository,
    private val blockRepository: BlockRepository,
    private val authRepository: AuthRepository,
    private val networkMonitor: NetworkMonitor,
    private val favorites: FavoritePeoplePreferences,
) : ViewModel() {

    private val _state = MutableStateFlow<ScreenState<PeopleData>>(ScreenState.Initial)
    val state: StateFlow<ScreenState<PeopleData>> = _state.asStateFlow()

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _blocked = MutableStateFlow<List<User>>(emptyList())

    private var loaded = false
    val busy = MutableStateFlow(false)
    val notice = MutableStateFlow<String?>(null)
    val favoriteIds = authRepository.sessionFlow.flatMapLatest { favorites.observe(it?.userId.orEmpty()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptySet())
    fun consumeNotice() { notice.value = null }

    fun favorite(userId: String, enabled: Boolean) = viewModelScope.launch {
        try { favorites.setFavorite(authRepository.sessionFlow.value?.userId.orEmpty(), userId, enabled) }
        catch (e: CancellationException) { throw e }
        catch (e: Exception) { notice.value = "Couldn't save this favorite. Try again." }
    }

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
                        loaded -> ScreenState.Content(data)
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
                is AppResult.Failure -> {
                    if (!loaded) _state.value = result.error.toScreenStateError(networkMonitor.isCurrentlyOnline())
                    else notice.value = result.error.toUserMessage()
                }
                AppResult.Loading -> Unit
            }
            // Blocked users are loaded alongside friends so the Blocked tab is
            // populated without a second round-trip when the user opens it.
            runCatching {
                blockRepository.refresh()
                _blocked.value = blockRepository.resolveUsers()
            }
            if (loaded) _state.value = ScreenState.Content(PeopleData(
                friendsRepository.friends.value, friendsRepository.incomingRequests.value,
                friendsRepository.outgoingRequests.value, _blocked.value,
            ))
        }
    }

    fun accept(request: FriendRequest) = mutate {
        friendsRepository.acceptRequest(request.id, request.fromUserId)
    }

    fun decline(request: FriendRequest) = mutate {
        friendsRepository.declineRequest(request.id)
    }

    fun cancel(request: FriendRequest) = mutate {
        friendsRepository.cancelRequest(request.id)
    }

    fun removeFriend(friend: Friend) = mutate {
        friendsRepository.removeFriend(friend.user.id)
    }

    fun unblock(userId: String) = mutate {
        val result = blockRepository.unblock(userId)
        if (result is AppResult.Success) _blocked.value = blockRepository.resolveUsers()
        result
    }

    private fun mutate(action: suspend () -> AppResult<Unit>) {
        if (busy.value) return
        busy.value = true
        viewModelScope.launch {
            try {
                val result = action()
                if (result is AppResult.Failure) notice.value = result.error.toUserMessage()
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { notice.value = "Couldn't save this change. Try again." }
            finally { busy.value = false }
        }
    }

    /** Opens (or creates) the direct conversation with [otherUserId] then invokes [onReady]. */
    fun openChat(otherUserId: String, onReady: (String) -> Unit) {
        val me = authRepository.sessionFlow.value?.userId
        if (me.isNullOrBlank()) return
        viewModelScope.launch {
            when (val result = conversationRepository.openDirectConversation(me, otherUserId)) {
                is AppResult.Success -> onReady(result.data)
                is AppResult.Failure -> notice.value = result.error.toUserMessage()
                else -> Unit
            }
        }
    }
}
