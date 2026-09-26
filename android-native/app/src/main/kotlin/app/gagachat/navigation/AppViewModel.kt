package app.gagachat.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.di.ApplicationScope
import app.gagachat.core.data.preferences.OnboardingPreferences
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.sync.RealtimeCoordinator
import app.gagachat.core.network.session.AuthSession
import app.gagachat.sync.workers.SyncInitializer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * App-level gate (PDF §3). The persisted session is read synchronously from
 * encrypted storage, so a returning user lands on Home immediately while token
 * refresh and profile sync run in the background.
 *
 * It also exposes the first-run onboarding flag (Master Spec §C) so the root
 * composable can decide between the onboarding graph and the main graph.
 */
@HiltViewModel
class AppViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val onboardingPreferences: OnboardingPreferences,
    private val syncInitializer: SyncInitializer,
    private val realtimeCoordinator: RealtimeCoordinator,
    @ApplicationScope private val applicationScope: CoroutineScope,
) : ViewModel() {

    val session: StateFlow<AuthSession?> = authRepository.sessionFlow

    /** null = not yet loaded from DataStore; false = show onboarding; true = done. */
    val onboardingCompleted: StateFlow<Boolean?> = onboardingPreferences.completed
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    init {
        // Fast, offline-safe bootstrap (no network on the critical path).
        authRepository.bootstrap()
        // Background validation + refresh; clears the session if revoked.
        viewModelScope.launch { authRepository.validateAndRefresh() }
        // Kick off background sync once a session exists (PDF §4).
        if (authRepository.isLoggedIn()) {
            syncInitializer.start()
            // Re-join the realtime topics with the now-available access token: the
            // socket may have connected at process start before login existed.
            realtimeCoordinator.restart(applicationScope)
        }
    }
}
