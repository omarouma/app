package app.gagachat.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.di.ApplicationScope
import app.gagachat.core.common.network.NetworkMonitor
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.preferences.OnboardingPreferences
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.data.sync.RealtimeCoordinator
import app.gagachat.core.network.session.AuthSession
import app.gagachat.feature.calls.call.ZegoCallManager
import app.gagachat.push.PushTokenRegistrar
import com.google.firebase.messaging.FirebaseMessaging
import app.gagachat.sync.workers.SyncInitializer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
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
    private val userRepository: UserRepository,
    private val onboardingPreferences: OnboardingPreferences,
    private val syncInitializer: SyncInitializer,
    private val realtimeCoordinator: RealtimeCoordinator,
    private val networkMonitor: NetworkMonitor,
    private val zegoCallManager: ZegoCallManager,
    private val pushTokenRegistrar: PushTokenRegistrar,
    @ApplicationScope private val applicationScope: CoroutineScope,
) : ViewModel() {

    val session: StateFlow<AuthSession?> = authRepository.sessionFlow

    /**
     * Whether the signed-in account still needs to run profile setup.
     *
     * Profile setup is **only** for a newly created account, so this is resolved
     * per account (not per install):
     *  - `true`  → show the onboarding graph (brand-new account, no profile yet).
     *  - `false` → go straight to the main graph (returning account / already set up).
     *  - `null`  → still resolving (show a neutral splash frame).
     *
     * Resolution order:
     *  1. A locally stored per-account status wins (set on sign-up / login /
     *     onboarding completion).
     *  2. If unknown (e.g. a session restored on a fresh install), check whether
     *     the account already has a profile on the backend — an account with a
     *     username has clearly been set up before, so it skips onboarding.
     */
    @OptIn(ExperimentalCoroutinesApi::class)
    val needsOnboarding: StateFlow<Boolean?> = authRepository.sessionFlow
        .flatMapLatest { session ->
            if (session == null) {
                flowOf<Boolean?>(null)
            } else {
                flow<Boolean?> {
                    val userId = session.userId
                    when (onboardingPreferences.status(userId).first()) {
                        true -> emit(false)
                        false -> emit(true)
                        null -> {
                            // Unknown → resolve from the account's real profile.
                            emit(null)
                            val hasProfile = runCatching {
                                val result = userRepository.getUser(userId)
                                (result as? AppResult.Success)?.data?.username?.isNotBlank() == true
                            }.getOrDefault(false)
                            if (hasProfile) {
                                onboardingPreferences.markCompleted(userId)
                                emit(false)
                            } else {
                                emit(true)
                            }
                        }
                    }
                }
            }
        }
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
                    // `onNewToken()` is not guaranteed to run after every login.
                    // Fetch the current FCM token and bind it to this authenticated
                    // user/device so background messages and incoming calls can route.
                    runCatching {
                        FirebaseMessaging.getInstance().token
                            .addOnSuccessListener { token ->
                                if (token.isNotBlank()) {
                                    viewModelScope.launch { pushTokenRegistrar.register(token) }
                                }
                            }
                    }
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
