package app.gagachat.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.di.ApplicationScope
import app.gagachat.core.common.network.NetworkMonitor
import app.gagachat.core.data.preferences.OnboardingPreferences
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.sync.RealtimeCoordinator
import app.gagachat.core.network.session.AuthSession
import app.gagachat.feature.calls.call.ZegoCallManager
import app.gagachat.sync.workers.SyncInitializer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * App-level gate (PDF \u00a73). The persisted session is read synchronously from
 * encrypted storage, so a returning user lands on Home immediately while token
 * refresh and profile sync run in the background.
 *
 * It also exposes the first-run onboarding flag (Master Spec \u00a7C) so the root
 * composable can decide between the onboarding graph and the main graph, and it
 * owns the ZEGOCLOUD Call Kit lifecycle: the SDK is initialised the moment a
 * signed-in session exists and torn down on logout (PDF \u00a78 \u2014 real calling).
 */
@HiltViewModel
class AppViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val onboardingPreferences: OnboardingPreferences,
    private val syncInitializer: SyncInitializer,
    private val realtimeCoordinator: RealtimeCoordinator,
    private val networkMonitor: NetworkMonitor,
    private val zegoCallManager: ZegoCallManager,
    @ApplicationScope private val applicationScope: CoroutineScope,
) : ViewModel() {

    val session: StateFlow<AuthSession?> = authRepository.sessionFlow

    /** null = not yet loaded from DataStore; false = show onboarding; true = done. */
    val onboardingCompleted: StateFlow<Boolean?> = onboardingPreferences.completed
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    /** Live connectivity, surfaced as the app-wide offline banner (Master Spec \u00a7E). */
    val isOnline: StateFlow<Boolean> = networkMonitor.isOnline

    init {
        // Fast, offline-safe bootstrap (no network on the critical path).
        authRepository.bootstrap()
        // Background validation + refresh; clears the session if revoked.
        viewModelScope.launch { authRepository.validateAndRefresh() }
        // Kick off background sync once a session exists (PDF \u00a74).
        if (authRepository.isLoggedIn()) {
            syncInitializer.start()
            // Re-join the realtime topics with the now-available access token: the
            // socket may have connected at process start before login existed.
            realtimeCoordinator.restart(applicationScope)
        }
        // Keep the calling subsystem in lock-step with the session (PDF \u00a78).
        observeSessionForCalling()
    }

    /**
     * Initialises the ZEGOCLOUD Call Kit as soon as a session exists and tears it
     * down on logout. This is what makes incoming calls ring for the signed-in
     * user and lets outgoing calls be placed from anywhere in the app.
     */
    private fun observeSessionForCalling() {
        viewModelScope.launch {
            authRepository.sessionFlow.collect { session ->
                if (session != null) {
                    zegoCallManager.init(
                        userId = session.userId,
                        userName = session.displayName?.takeIf { it.isNotBlank() }
                            ?: session.email?.substringBefore('@')?.takeIf { it.isNotBlank() }
                            ?: "GaGa User",
                    )
                } else {
                    zegoCallManager.uninit()
                }
            }
        }
    }

    /**
     * Called when connectivity is restored (Master Spec \u00a7E \u2014 auto-recovery).
     * Re-arms the background sync and re-establishes the realtime socket so any
     * messages queued while offline flush immediately and the live fast path
     * resumes, without the user having to touch anything.
     */
    fun onReconnected() {
        if (!authRepository.isLoggedIn()) return
        syncInitializer.start()
        realtimeCoordinator.restart(applicationScope)
    }
}
