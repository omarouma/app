package app.gagachat.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.di.ApplicationScope
import app.gagachat.core.common.network.NetworkMonitor
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.call.CallSignalingCoordinator
import app.gagachat.core.data.call.isVideoInvite
import app.gagachat.core.data.preferences.OnboardingPreferences
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.data.sync.RealtimeCoordinator
import app.gagachat.core.firebase.FirebaseSessionCoordinator
import app.gagachat.core.model.CallSignalKind
import app.gagachat.core.network.session.AuthSession
import app.gagachat.feature.calls.call.LiveKitCallManager
import app.gagachat.feature.calls.navigation.CallRoutes
import app.gagachat.push.PendingDeepLink
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
 * owns the calling lifecycle: the LiveKit SDK is initialised and the call
 * signalling channel is joined the moment a signed-in session exists, and both
 * are torn down on logout (PDF \u00a78 \u2014 real calling).
 */
@HiltViewModel
class AppViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val privacyApi: app.gagachat.core.network.rest.SupabaseRestApi,
    private val userRepository: UserRepository,
    private val onboardingPreferences: OnboardingPreferences,
    private val syncInitializer: SyncInitializer,
    private val realtimeCoordinator: RealtimeCoordinator,
    private val networkMonitor: NetworkMonitor,
    private val liveKitCallManager: LiveKitCallManager,
    private val callSignalingCoordinator: CallSignalingCoordinator,
    private val pushTokenRegistrar: PushTokenRegistrar,
    private val firebaseSessionCoordinator: FirebaseSessionCoordinator,
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

    /** Last invite rung through [PendingDeepLink], used to de-duplicate replays. */
    private var lastRungCallId: String? = null
    private var lastRungAt: Long = 0L

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
        // Ring the incoming-call screen for foreground invites (PDF \u00a78).
        observeIncomingCalls()
        // Keep Firebase Auth in lock-step with the Supabase session so the
        // Firestore/RTDB mirror is authorised (uid == Supabase uid). No-op unless
        // the Hybrid transport flag is enabled at build time.
        firebaseSessionCoordinator.start(applicationScope, authRepository.sessionFlow)
    }

    /**
     * Brings the calling subsystem up as soon as a session exists and tears it
     * down on logout. This is what makes incoming calls ring for the signed-in
     * user and lets outgoing calls be placed from anywhere in the app.
     *
     * The LiveKit SDK only needs one-time initialisation (it loads the native
     * WebRTC libraries), whereas the signalling inbox is per-user and is
     * therefore re-joined whenever the account changes.
     */
    private fun observeSessionForCalling() {
        viewModelScope.launch {
            var syncedUserId: String? = null
            authRepository.sessionFlow.collect { session ->
                if (session != null) {
                    if (syncedUserId != session.userId) {
                        syncInitializer.start()
                        realtimeCoordinator.restart(applicationScope)
                        callSignalingCoordinator.start(applicationScope, session.userId)
                        syncedUserId = session.userId
                    }
                    liveKitCallManager.ensureInitialized()
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
                    realtimeCoordinator.stop()
                    callSignalingCoordinator.stop()
                    liveKitCallManager.shutdown()
                    syncedUserId = null
                    lastRungCallId = null
                    lastRungAt = 0L
                }
            }
        }
    }

    /**
     * Rings the incoming-call screen when a live invite arrives for this user.
     *
     * The FCM push path (see [app.gagachat.push.GagaFirebaseMessagingService])
     * covers a
     * backgrounded or killed app; this collector is what makes a *foreground*
     * callee ring instantly, without waiting for a push round-trip. The invite is
     * turned into the very same `call/incoming?...` route the notification uses,
     * so there is exactly one way into an incoming call and the "never originate
     * a new outgoing call from a deep link" invariant is preserved.
     *
     * Invites are addressed to the user's personal inbox topic, but the payload
     * is also re-checked against the signed-in id here: a stale invite for a
     * previous account must never ring the current user.
     */
    private fun observeIncomingCalls() {
        viewModelScope.launch {
            callSignalingCoordinator.signals.collect { signal ->
                if (signal.kind != CallSignalKind.RINGING) return@collect
                val self = session.value?.userId ?: return@collect
                if (signal.toUserId.isNotEmpty() && signal.toUserId != self) return@collect
                if (signal.conversationId.isBlank() || signal.callId.isBlank()) return@collect
                if (!runCatching { privacyApi.validateIncomingCall(signal.callId, signal.fromUserId) }.getOrDefault(false)) return@collect
                // A call is already up (or being set up): never stack a second
                // incoming screen on top of the one the user is looking at.
                if (liveKitCallManager.isActive()) return@collect
                // Broadcasts are fire-and-forget and may be replayed after a
                // socket reconnect; collapse repeats of the same invite.
                val now = System.currentTimeMillis()
                if (signal.callId == lastRungCallId && now - lastRungAt < RING_DEDUPE_MS) {
                    return@collect
                }
                lastRungCallId = signal.callId
                lastRungAt = now
                PendingDeepLink.set(
                    CallRoutes.incomingCall(
                        conversationId = signal.conversationId,
                        callId = signal.callId,
                        isVideo = signal.isVideoInvite(),
                    ),
                )
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
        session.value?.let { current ->
            liveKitCallManager.ensureInitialized()
            callSignalingCoordinator.start(applicationScope, current.userId)
        }
    }
}

/**
 * Window during which a repeat of the same call invite is ignored. Long enough
 * to absorb a Realtime reconnect replay, short enough that a genuine re-ring
 * from the caller still reaches the user.
 */
private const val RING_DEDUPE_MS = 10_000L
