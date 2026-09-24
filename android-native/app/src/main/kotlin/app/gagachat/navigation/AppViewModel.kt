package app.gagachat.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.network.session.AuthSession
import app.gagachat.sync.workers.SyncInitializer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * App-level session gate (PDF §3). The persisted session is read synchronously
 * from encrypted storage, so a returning user lands on Home immediately while
 * token refresh and profile sync run in the background.
 */
@HiltViewModel
class AppViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val syncInitializer: SyncInitializer,
) : ViewModel() {

    val session: StateFlow<AuthSession?> = authRepository.sessionFlow

    init {
        // Fast, offline-safe bootstrap (no network on the critical path).
        authRepository.bootstrap()
        // Background validation + refresh; clears the session if revoked.
        viewModelScope.launch { authRepository.validateAndRefresh() }
        // Kick off background sync once a session exists (PDF §4).
        if (authRepository.isLoggedIn()) {
            syncInitializer.start()
        }
    }
}
