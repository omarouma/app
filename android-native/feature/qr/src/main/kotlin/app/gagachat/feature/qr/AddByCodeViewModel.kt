package app.gagachat.feature.qr

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.model.FriendRequest
import app.gagachat.core.model.User
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class AddByCodeStatus { IDLE, SEARCHING, FOUND, NOT_FOUND, ERROR }

data class AddByCodeUiState(
    val input: String = "",
    val status: AddByCodeStatus = AddByCodeStatus.IDLE,
    val result: User? = null,
    val isFriend: Boolean = false,
    val requestSent: Boolean = false,
    val outgoingRequest: FriendRequest? = null,
    val incomingRequest: FriendRequest? = null,
    val isSending: Boolean = false,
    val error: String? = null,
)

/** Scan or paste -> verify profile -> explicitly confirm friendship. */
@HiltViewModel
class AddByCodeViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val friendsRepository: FriendsRepository,
    private val conversationRepository: ConversationRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(AddByCodeUiState())
    val state: StateFlow<AddByCodeUiState> = _state.asStateFlow()
    private val myId get() = authRepository.sessionFlow.value?.userId.orEmpty()
    private var lookupJob: Job? = null
    private var actionJob: Job? = null

    init {
        viewModelScope.launch {
            authRepository.sessionFlow.map { it?.userId }.distinctUntilChanged().collect {
                lookupJob?.cancel()
                actionJob?.cancel()
                _state.value = AddByCodeUiState()
            }
        }
        viewModelScope.launch {
            combine(friendsRepository.friends, friendsRepository.incomingRequests,
                friendsRepository.outgoingRequests) { friends, incoming, outgoing ->
                Triple(friends, incoming, outgoing)
            }.collect { (friends, incoming, outgoing) ->
                _state.update { current ->
                    val target = current.result?.id
                    val sent = outgoing.firstOrNull { it.fromUserId == myId && it.toUserId == target }
                    current.copy(
                        isFriend = friends.any { it.user.id == target },
                        incomingRequest = incoming.firstOrNull { it.toUserId == myId && it.fromUserId == target },
                        outgoingRequest = sent, requestSent = sent != null,
                    )
                }
            }
        }
    }

    fun onInputChange(value: String) {
        if (_state.value.isSending) return
        lookupJob?.cancel()
        _state.update {
            it.copy(input = value.take(2048), status = AddByCodeStatus.IDLE,
                result = null, error = null, isFriend = false,
                requestSent = false, incomingRequest = null, outgoingRequest = null)
        }
    }

    fun lookup() {
        val owner = myId
        if (owner.isBlank()) { showError("Sign in to find friends."); return }
        if (_state.value.isSending) return
        val raw = _state.value.input.trim()
        val userId = QrPayload.decodeUserId(raw)
        val handle = QrPayload.decodeUsername(raw)
            ?: raw.takeIf {
                it.length in 2..32 && it.matches(Regex("[A-Za-z0-9_.]+"))
            }
        if (userId == null && handle == null) {
            _state.update {
                it.copy(status = AddByCodeStatus.ERROR,
                    error = "This is not a GaGa profile code. Scan a GaGa QR, enter a valid user ID or @username.")
            }
            return
        }
        lookupJob?.cancel()
        lookupJob = viewModelScope.launch {
            _state.update { it.copy(status = AddByCodeStatus.SEARCHING, error = null, result = null) }
            try {
                val found: User? = when {
                    userId != null -> when (val result = userRepository.getUser(userId)) {
                        is AppResult.Success -> result.data
                        is AppResult.Failure -> {
                            showError(result.error.toUserMessage())
                            return@launch
                        }
                        AppResult.Loading -> null
                    }
                    else -> when (val result = userRepository.searchUsersRemote(handle.orEmpty())) {
                        is AppResult.Success -> result.data.firstOrNull {
                            it.username?.equals(handle, ignoreCase = true) == true
                        }
                        is AppResult.Failure -> {
                            showError(result.error.toUserMessage())
                            return@launch
                        }
                        AppResult.Loading -> null
                    }
                }
                if (owner != myId) return@launch
                if (found == null || found.id == myId) {
                    _state.update {
                        it.copy(status = AddByCodeStatus.NOT_FOUND,
                            error = if (found?.id == myId) "This is your own QR code." else "No matching GaGa profile found.")
                    }
                    return@launch
                }
                // Refresh request status: a past request must not be sent again.
                when (val result = friendsRepository.refresh()) {
                    is AppResult.Failure -> {
                        showError(result.error.toUserMessage())
                        return@launch
                    }
                    else -> Unit
                }
                val isFriend = friendsRepository.friends.value.any { it.user.id == found.id }
                val outgoing = friendsRepository.outgoingRequests.value.firstOrNull { it.toUserId == found.id }
                val alreadySent = outgoing != null
                val incoming = friendsRepository.incomingRequests.value.firstOrNull { it.fromUserId == found.id }
                _state.update {
                    it.copy(status = AddByCodeStatus.FOUND, result = found,
                        isFriend = isFriend, requestSent = alreadySent, incomingRequest = incoming, outgoingRequest = outgoing)
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                showError("Could not verify this profile. Check your connection and retry.")
            }
        }
    }

    private fun showError(message: String) {
        _state.update { it.copy(status = AddByCodeStatus.ERROR, error = message, isSending = false) }
    }

    fun sendRequest() {
        val snapshot = _state.value
        val target = snapshot.result ?: return
        if (snapshot.isFriend || snapshot.requestSent || snapshot.incomingRequest != null) return
        changeFriendship { friendsRepository.sendRequest(target.id) }
    }

    fun acceptIncoming() {
        val request = _state.value.incomingRequest ?: return
        changeFriendship { friendsRepository.acceptRequest(request.id, request.fromUserId) }
    }

    fun declineIncoming() {
        val request = _state.value.incomingRequest ?: return
        changeFriendship { friendsRepository.declineRequest(request.id) }
    }

    fun cancelOutgoing() {
        val request = _state.value.outgoingRequest ?: return
        changeFriendship { friendsRepository.cancelRequest(request.id) }
    }

    private fun changeFriendship(operation: suspend () -> AppResult<Unit>) {
        val owner = myId
        val target = _state.value.result?.id ?: return
        if (owner.isBlank() || _state.value.isSending) return
        _state.update { it.copy(isSending = true, error = null) }
        actionJob = viewModelScope.launch {
            try {
                val result = operation()
                if (owner == myId && _state.value.result?.id == target && result is AppResult.Failure) {
                    _state.update { it.copy(error = result.error.toUserMessage()) }
                }
            } catch (error: CancellationException) { throw error }
            catch (_: Exception) {
                if (owner == myId) _state.update { it.copy(error = "Could not update friend request. Retry.") }
            } finally {
                if (owner == myId) _state.update { it.copy(isSending = false) }
            }
        }
    }

    /** Opens a chat only after the user explicitly taps Open Chat. */
    fun openChat(onReady: (String) -> Unit) {
        val target = _state.value.result ?: return
        val me = myId
        if (me.isBlank() || !_state.value.isFriend || _state.value.isSending) return
        _state.update { it.copy(isSending = true, error = null) }
        actionJob = viewModelScope.launch {
            try {
                when (val result = conversationRepository.openDirectConversation(me, target.id)) {
                    is AppResult.Success -> if (myId == me) onReady(result.data)
                    is AppResult.Failure -> if (myId == me) _state.update { it.copy(error = result.error.toUserMessage()) }
                    AppResult.Loading -> Unit
                }
            } catch (error: CancellationException) { throw error }
            catch (_: Exception) {
                if (myId == me) _state.update { it.copy(error = "Could not open chat. Retry.") }
            } finally {
                if (myId == me) _state.update { it.copy(isSending = false) }
            }
        }
    }
}
