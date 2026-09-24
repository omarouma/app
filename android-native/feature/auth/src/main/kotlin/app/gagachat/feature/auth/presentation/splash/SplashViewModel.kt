package app.gagachat.feature.auth.presentation.splash

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface SplashState {
    data object Loading : SplashState
    data object Authenticated : SplashState
    data object NeedsLogin : SplashState
}

/**
 * Session bootstrap (PDF §3). Reads the persisted secure session synchronously
 * (no network) and routes straight to Home when present, while kicking off a
 * background token refresh that never blocks the first frame.
 */
@HiltViewModel
class SplashViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<SplashState>(SplashState.Loading)
    val state: StateFlow<SplashState> = _state.asStateFlow()

    init {
        val session = authRepository.bootstrap()
        if (session != null) {
            _state.value = SplashState.Authenticated
            // Background refresh — does not block navigation.
            viewModelScope.launch { authRepository.validateAndRefresh() }
        } else {
            _state.value = SplashState.NeedsLogin
        }
    }
}
