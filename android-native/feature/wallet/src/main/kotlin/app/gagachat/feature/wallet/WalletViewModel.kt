package app.gagachat.feature.wallet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.WalletRepository
import app.gagachat.core.model.CoinActivity
import app.gagachat.core.model.Wallet
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class WalletUi(
    val wallet: Wallet,
    val activity: List<CoinActivity>,
)

/** Coin wallet: balance, top-up, activity (Master Spec §C). */
@HiltViewModel
class WalletViewModel @Inject constructor(
    private val walletRepository: WalletRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<ScreenState<WalletUi>>(ScreenState.Initial)
    val state: StateFlow<ScreenState<WalletUi>> = _state.asStateFlow()

    private val _topUpMessage = MutableStateFlow<String?>(null)
    val topUpMessage: StateFlow<String?> = _topUpMessage.asStateFlow()

    init {
        viewModelScope.launch {
            walletRepository.wallet.collect { wallet ->
                if (wallet != null) {
                    _state.value = ScreenState.Content(
                        WalletUi(wallet = wallet, activity = walletRepository.activity.value),
                    )
                }
            }
        }
        viewModelScope.launch {
            walletRepository.activity.collect { activity ->
                val current = (_state.value as? ScreenState.Content)?.data ?: return@collect
                _state.value = ScreenState.Content(current.copy(activity = activity))
            }
        }
        load()
    }

    private fun load() {
        viewModelScope.launch {
            if (_state.value !is ScreenState.Content) _state.value = ScreenState.Loading
            when (val r = walletRepository.ensureWallet()) {
                is AppResult.Success -> _state.value = ScreenState.Content(
                    WalletUi(r.data, walletRepository.activity.value),
                )
                is AppResult.Failure -> if (_state.value !is ScreenState.Content) {
                    _state.value = ScreenState.Error(r.error.toUserMessage(), retryable = true)
                }
                AppResult.Loading -> Unit
            }
        }
    }

    fun refresh() = load()

    fun topUp(amount: Long) = viewModelScope.launch {
        when (val r = walletRepository.topUp(amount)) {
            is AppResult.Success -> _topUpMessage.value = "Added ${amount} coins"
            is AppResult.Failure -> _topUpMessage.value = r.error.toUserMessage()
            AppResult.Loading -> Unit
        }
    }

    fun consumeTopUpMessage() { _topUpMessage.value = null }
}
