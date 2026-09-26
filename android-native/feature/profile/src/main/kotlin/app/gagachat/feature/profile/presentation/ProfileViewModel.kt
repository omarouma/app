package app.gagachat.feature.profile.presentation

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.model.User
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileUiState(
    val userId: String = "",
    val user: User? = null,
    val isSelf: Boolean = false,
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
    val friendsCount: Int = 0,
    val followersCount: Int = 0,
    val followingCount: Int = 0,
) {
    /**
     * Profile completeness (0..100). Derived from which optional profile fields
     * the user has filled in: avatar, bio, username and a contact channel. This
     * mirrors the "Profile completeness" progress card in the reference design.
     */
    val completeness: Int
        get() {
            val u = user ?: return 0
            var score = 0
            if (!u.avatar.isNullOrBlank()) score += 25
            if (!u.bio.isNullOrBlank()) score += 25
            if (!u.username.isNullOrBlank()) score += 25
            if (!u.phone.isNullOrBlank() || !u.email.isNullOrBlank()) score += 25
            return score
        }
}

@HiltViewModel
class ProfileViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val userRepository: UserRepository,
    private val conversationRepository: ConversationRepository,
    private val friendsRepository: FriendsRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val requestedId: String = savedStateHandle.get<String>("userId").orEmpty()
    private val currentUserId: String = authRepository.sessionFlow.value?.userId.orEmpty()
    private val userId: String = requestedId.ifBlank { currentUserId }

    private val _state = MutableStateFlow(ProfileUiState(userId = userId, isSelf = userId == currentUserId))
    val state: StateFlow<ProfileUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            userRepository.observeUser(userId).collect { user ->
                _state.update { it.copy(user = user, isLoading = false) }
            }
        }
        viewModelScope.launch {
            when (val result = userRepository.refreshUser(userId)) {
                is AppResult.Failure -> _state.update { it.copy(errorMessage = result.error.toUserMessage(), isLoading = false) }
                else -> Unit
            }
        }
        // Friends count powers the stats row on the profile header. Followers /
        // following are not yet backed by a table, so they stay at 0.
        viewModelScope.launch {
            friendsRepository.friends.collect { list ->
                _state.update { it.copy(friendsCount = list.size) }
            }
        }
    }

    fun consumeError() = _state.update { it.copy(errorMessage = null) }

    /**
     * Opens (or creates) the DIRECT conversation with this profile's user and
     * hands the resolved conversation id back to the caller. Previously the
     * "Message" button navigated to the profile again, so it never reached a chat.
     */
    fun openChat(onReady: (conversationId: String) -> Unit) {
        val me = authRepository.sessionFlow.value?.userId
        if (me.isNullOrBlank() || userId.isBlank()) return
        viewModelScope.launch {
            when (val result = conversationRepository.openDirectConversation(me, userId)) {
                is AppResult.Success -> onReady(result.data)
                is AppResult.Failure -> _state.update { it.copy(errorMessage = result.error.toUserMessage()) }
                AppResult.Loading -> Unit
            }
        }
    }

    /**
     * Resolves the DIRECT conversation with this profile's user, then starts a
     * voice/video call on it. Previously the raw userId was passed where a
     * conversationId was expected, so the call screen opened on a bogus id.
     */
    fun startCall(isVideo: Boolean, onReady: (conversationId: String, isVideo: Boolean) -> Unit) {
        val me = authRepository.sessionFlow.value?.userId
        if (me.isNullOrBlank() || userId.isBlank()) return
        viewModelScope.launch {
            when (val result = conversationRepository.openDirectConversation(me, userId)) {
                is AppResult.Success -> onReady(result.data, isVideo)
                is AppResult.Failure -> _state.update { it.copy(errorMessage = result.error.toUserMessage()) }
                AppResult.Loading -> Unit
            }
        }
    }
}
