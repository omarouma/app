package app.gagachat.feature.wallet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.WalletRepository
import app.gagachat.core.model.Friend
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SendCoinsUiState(
    val friends: List<Friend> = emptyList(),
    val selected: Friend? = null,
    val amountText: String = "",
    val note: String = "",
    val isSending: Boolean = false,
    val error: String? = null,
    /** True while the explicit "confirm this transfer" step is on screen. */
    val showConfirm: Boolean = false,
) {
    val amount: Long get() = amountText.toLongOrNull() ?: 0L
    val canSend: Boolean get() = selected != null && amount > 0 && !isSending
}

/** Send coins to a friend (Master Spec §C). */
@HiltViewModel
class SendCoinsViewModel @Inject constructor(
    private val walletRepository: WalletRepository,
    private val friendsRepository: FriendsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(SendCoinsUiState())
    val state: StateFlow<SendCoinsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch { friendsRepository.refresh() }
        viewModelScope.launch {
            friendsRepository.friends.collect { friends ->
                _state.update { it.copy(friends = friends) }
            }
        }
    }

    fun select(friend: Friend) = _state.update { it.copy(selected = friend, error = null) }
    fun onAmountChange(value: String) = _state.update {
        it.copy(amountText = value.filter { c -> c.isDigit() }.take(9), error = null)
    }
    fun onNoteChange(value: String) = _state.update { it.copy(note = value, error = null) }

    /**
     * Opens the explicit confirmation step. Nothing is sent yet — the transfer
     * only leaves the device after the user confirms here, and the UI only shows
     * success once the server `wallet_transfer` RPC returns success.
     */
    fun requestConfirmation() {
        if (!_state.value.canSend) return
        _state.update { it.copy(showConfirm = true, error = null) }
    }

    fun dismissConfirmation() = _state.update { it.copy(showConfirm = false) }

    fun send(onSent: () -> Unit) {
        val snapshot = _state.value
        if (snapshot.isSending || !snapshot.showConfirm) return
        val target = snapshot.selected ?: return
        if (snapshot.amount <= 0) {
            _state.update { it.copy(showConfirm = false, error = "Enter an amount greater than zero") }
            return
        }
        // Claim the confirmed request before scheduling: queued taps must not launch another transfer.
        _state.update { it.copy(isSending = true, showConfirm = false, error = null) }
        viewModelScope.launch {
            when (val r = walletRepository.sendCoins(
                toUserId = target.user.id,
                toName = target.user.displayName,
                amount = snapshot.amount,
                note = snapshot.note.ifBlank { null },
            )) {
                is AppResult.Success -> {
                    _state.update { it.copy(isSending = false) }
                    onSent()
                }
                is AppResult.Failure -> _state.update {
                    it.copy(isSending = false, error = r.error.toUserMessage())
                }
                AppResult.Loading -> Unit
            }
        }
    }
}
