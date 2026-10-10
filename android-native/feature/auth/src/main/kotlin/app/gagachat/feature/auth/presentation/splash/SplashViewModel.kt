package app.gagachat.feature.auth.presentation.splash

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.preferences.AppIntroPreferences
import app.gagachat.core.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface SplashState {
    data object Loading : SplashState
    data object Authenticated : SplashState

    /** No session + first launch → show the Welcome/marketing screen. */
    data object NeedsWelcome : SplashState

    /** No session + intro already seen → go straight to Sign In. */
    data object NeedsLogin : SplashState
}

/**
 * Session bootstrap (PDF §3, Master Spec §C — startup journey).
 *
 * Reads the persisted secure session synchronously (no network) and routes:
 *  - a valid session straight to Home (the shell swaps graphs), while kicking
 *    off a background token refresh that never blocks the first frame;
 *  - otherwise to the Welcome screen on a brand-new install, or to Sign In when
 *    the first-run intro has already been completed.
 */
@HiltViewModel
class SplashViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val introPreferences: AppIntroPreferences,
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
            // No session: decide between the first-run Welcome screen and Sign In.
            viewModelScope.launch {
                val welcomeSeen = introPreferences.welcomeSeen.first()
                _state.value = if (welcomeSeen) SplashState.NeedsLogin else SplashState.NeedsWelcome
            }
        }
    }
}
