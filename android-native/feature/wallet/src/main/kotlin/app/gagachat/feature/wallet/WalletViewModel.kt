package app.gagachat.feature.wallet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.network.NetworkMonitor
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.WalletRepository
import app.gagachat.core.model.CoinActivity
import app.gagachat.core.model.Wallet
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.util.toScreenStateError
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import javax.inject.Inject

data class WalletUi(
    val wallet: Wallet,
    val activity: List<CoinActivity>,
)

/** Coin wallet: balance, top-up, activity (Master Spec §C). */
@HiltViewModel
class WalletViewModel @Inject constructor(
    private val walletRepository: WalletRepository,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _state = MutableStateFlow<ScreenState<WalletUi>>(ScreenState.Initial)
    val state: StateFlow<ScreenState<WalletUi>> = _state.asStateFlow()

    private val _topUpMessage = MutableStateFlow<String?>(null)
    val topUpMessage: StateFlow<String?> = _topUpMessage.asStateFlow()

    private var loadJob: Job? = null

    init {
        viewModelScope.launch {
            walletRepository.wallet.collect { wallet ->
                if (wallet == null) {
                    _state.value = ScreenState.Initial
                    _topUpMessage.value = null
                } else {
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
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _topUpMessage.value = null
            if (_state.value !is ScreenState.Content) _state.value = ScreenState.Loading
            when (val r = walletRepository.ensureWallet()) {
                is AppResult.Success -> _state.value = ScreenState.Content(
                    WalletUi(r.data, walletRepository.activity.value),
                )
                is AppResult.Failure -> {
                    if (_state.value !is ScreenState.Content) {
                        _state.value = r.error.toScreenStateError(networkMonitor.isCurrentlyOnline())
                    } else {
                        _topUpMessage.value = "Refresh failed. Showing previously loaded data; tap refresh to try again."
                    }
                }
                AppResult.Loading -> Unit
            }
        }
    }

    fun refresh() = load()

    fun topUp(amount: Long) {
        // Funding is intentionally not exposed: coins may only be credited by the
        // provider-settlement webhook after a verified payment. There is no
        // client-side balance write path, so we never fake a successful top-up.
        _topUpMessage.value = "Coin funding isn't available yet — top-ups are credited only " +
            "after a verified payment settlement. Use Daily Life → Money Book to record " +
            "personal expenses."
    }

    fun consumeTopUpMessage() { _topUpMessage.value = null }
}
