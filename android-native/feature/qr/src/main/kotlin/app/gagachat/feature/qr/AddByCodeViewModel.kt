package app.gagachat.feature.qr

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

enum class AddByCodeStatus { IDLE, SEARCHING, FOUND, NOT_FOUND, ERROR }

data class AddByCodeUiState(
    val input: String = "",
    val status: AddByCodeStatus = AddByCodeStatus.IDLE,
    val result: User? = null,
    val isFriend: Boolean = false,
    val requestSent: Boolean = false,
    val isSending: Boolean = false,
    val error: String? = null,
)

/**
 * "Add by code" (Master Spec §C). Accepts a scanned/pasted `gaga://user/<id>`
 * link, a bare user id, or an `@username`, resolves it to a user and lets the
 * caller send a friend request or open the profile.
 */
@HiltViewModel
class AddByCodeViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val friendsRepository: FriendsRepository,
    private val conversationRepository: ConversationRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AddByCodeUiState())
    val state: StateFlow<AddByCodeUiState> = _state.asStateFlow()

    private val myId: String get() = authRepository.sessionFlow.value?.userId.orEmpty()

    fun onInputChange(value: String) = _state.update {
        it.copy(input = value, status = AddByCodeStatus.IDLE, result = null, error = null, requestSent = false)
    }

    fun lookup() {
        val raw = _state.value.input.trim()
        if (raw.isBlank()) return
        viewModelScope.launch {
            _state.update { it.copy(status = AddByCodeStatus.SEARCHING, error = null, result = null) }
            val userId = QrPayload.decodeUserId(raw)
            val username = QrPayload.decodeUsername(raw)

            val user: User? = when {
                userId != null -> when (val r = userRepository.getUser(userId)) {
                    is AppResult.Success -> r.data
                    is AppResult.Failure -> null
                    AppResult.Loading -> null
                }
                username != null -> when (val r = userRepository.searchUsersRemote(username)) {
                    is AppResult.Success -> r.data.firstOrNull {
                        it.username?.equals(username, ignoreCase = true) == true
                    } ?: r.data.firstOrNull()
                    is AppResult.Failure -> null
                    AppResult.Loading -> null
                }
                else -> null
            }

            if (user == null || user.id == myId) {
                _state.update {
                    it.copy(
                        status = AddByCodeStatus.NOT_FOUND,
                        error = if (user?.id == myId) "That's your own code." else "No user found for that code.",
                    )
                }
                return@launch
            }

            val alreadyFriend = friendsRepository.isFriend(user.id)
            _state.update {
                it.copy(status = AddByCodeStatus.FOUND, result = user, isFriend = alreadyFriend)
            }
        }
    }

    fun sendRequest() {
        val target = _state.value.result ?: return
        viewModelScope.launch {
            _state.update { it.copy(isSending = true, error = null) }
            when (val r = friendsRepository.sendRequest(target.id)) {
                is AppResult.Success -> _state.update {
                    it.copy(isSending = false, requestSent = true)
                }
                is AppResult.Failure -> _state.update {
                    it.copy(isSending = false, error = r.error.toUserMessage())
                }
                AppResult.Loading -> Unit
            }
        }
    }

    /** Resolves/creates the direct conversation with the found user and reports its id. */
    fun openChat(onReady: (String) -> Unit) {
        val target = _state.value.result ?: return
        val me = myId
        if (me.isBlank()) return
        viewModelScope.launch {
            when (val r = conversationRepository.openDirectConversation(me, target.id)) {
                is AppResult.Success -> onReady(r.data)
                is AppResult.Failure -> _state.update { it.copy(error = r.error.toUserMessage()) }
                AppResult.Loading -> Unit
            }
        }
    }
}
