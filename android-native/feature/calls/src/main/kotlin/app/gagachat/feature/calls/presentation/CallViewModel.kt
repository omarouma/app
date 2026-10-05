package app.gagachat.feature.calls.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.call.CallSignalingCoordinator
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.CallRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.model.CallSession
import app.gagachat.core.model.CallSignal
import app.gagachat.core.model.CallSignalKind
import app.gagachat.core.model.CallStatus
import app.gagachat.core.model.CallType
import app.gagachat.core.ui.util.toUserMessage
import app.gagachat.feature.calls.call.CallConnection
import app.gagachat.feature.calls.call.CallEndedInfo
import app.gagachat.feature.calls.call.CallPeer
import app.gagachat.feature.calls.call.CallSoundPlayer
import app.gagachat.feature.calls.call.LiveKitCallManager
import dagger.hilt.android.lifecycle.HiltViewModel
import io.livekit.android.renderer.SurfaceViewRenderer
import io.livekit.android.room.participant.ConnectionQuality
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject

/**
 * High-level call lifecycle used by the UI (PDF \u00a78).
 *
 * After the LiveKit migration the responsibilities are split as follows:
 *  * **Media** \u2014 [LiveKitCallManager] owns the WebRTC room (join/leave, tracks,
 *    audio routing, remote participants).
 *  * **Signalling** \u2014 [CallSignalingCoordinator] owns the Supabase Realtime
 *    broadcast channel that carries ring / accept / reject / hang-up. LiveKit has
 *    no notion of "ringing", so the invite handshake is ours.
 *  * **Durability** \u2014 this ViewModel owns call history, the CALL_EVENT chat item
 *    and the final status/duration, so the ephemeral media session and the
 *    permanent record stay cleanly separated.
 */
enum class CallPhase {
    IDLE,
    OUTGOING_RINGING,
    INCOMING_RINGING,
    CONNECTING,
    CONNECTED,
    ENDED,
}

data class CallUiState(
    val history: List<CallSession> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val phase: CallPhase = CallPhase.IDLE,
    val activeCall: CallSession? = null,
    /** Server call id of the in-flight call, if one exists. */
    val callId: String? = null,
    val conversationId: String? = null,
    val peerId: String? = null,
    val peerName: String? = null,
    val peerAvatar: String? = null,
    /** True when this call carries video in either direction. */
    val isVideoCall: Boolean = false,
    val isMuted: Boolean = false,
    val isSpeakerOn: Boolean = false,
    val isVideoEnabled: Boolean = false,
    val elapsedSeconds: Long = 0L,
    /** True once the LiveKit room has been joined for this call. */
    val callLaunched: Boolean = false,
    /** True while the LiveKit room is connected and calls can flow. */
    val callingReady: Boolean = false,
    /** Remote participants currently in the room. */
    val peers: List<CallPeer> = emptyList(),
    val connectionQuality: ConnectionQuality = ConnectionQuality.UNKNOWN,
) {
    /** The remote participant the call surface should render, if any. */
    val primaryPeer: CallPeer? get() = peers.firstOrNull()
}

@HiltViewModel
class CallViewModel @Inject constructor(
    private val callRepository: CallRepository,
    private val authRepository: AuthRepository,
    private val conversationRepository: ConversationRepository,
    private val liveKitCallManager: LiveKitCallManager,
    private val callSignalingCoordinator: CallSignalingCoordinator,
    private val callSoundPlayer: CallSoundPlayer,
) : ViewModel() {

    private val _state = MutableStateFlow(CallUiState())
    val state: StateFlow<CallUiState> = _state.asStateFlow()

    /** The server call id of the in-flight call, persisted when it finishes. */
    private var activeCallId: String? = null
    private var setupJob: Job? = null

    /**
     * Fires when an outgoing call is never answered. LiveKit is a pure media
     * transport and has no notion of "ringing", so the ring timeout is ours to
     * enforce; without it an unanswered call would ring forever and leave a
     * durable server row stuck in `ringing`.
     */
    private var ringTimeoutJob: Job? = null

    /**
     * Fires when an incoming call is never answered and the caller never
     * withdraws the invite (e.g. their process died). Mirrors [ringTimeoutJob]
     * for the callee so a stale invite cannot ring forever.
     */
    private var incomingTimeoutJob: Job? = null
    private var connectionTimeoutJob: Job? = null

    init {
        observeHistory()
        refreshHistory()
        observeCallManager()
        observeSignaling()
    }

    // ---- Observation -------------------------------------------------------

    /**
     * Mirrors the LiveKit room state into the immutable UI state. Every flow the
     * call surface renders is derived from the SDK here, so the composables stay
     * free of SDK types (apart from the video renderer itself).
     */
    private fun observeCallManager() {
        viewModelScope.launch {
            liveKitCallManager.durationSeconds.collect { seconds ->
                if (activeCallId != null) {
                    _state.update { it.copy(elapsedSeconds = seconds) }
                }
            }
        }
        viewModelScope.launch {
            liveKitCallManager.connection.collect { connection ->
                _state.update { it.copy(callingReady = connection == CallConnection.CONNECTED) }
            }
        }
        viewModelScope.launch {
            liveKitCallManager.peers.collect { peers ->
                _state.update { current ->
                    // The call is only really "connected" once the other party is
                    // in the room \u2014 joining the SFU alone is not an answered call,
                    // and counting ring time as talk time produced the misleading
                    // "0m 0s" history rows the old implementation suffered from.
                    val nextPhase = when {
                        peers.isEmpty() || activeCallId == null -> current.phase
                        current.phase == CallPhase.ENDED -> current.phase
                        else -> {
                            // The other party is in the room, so the ring is over
                            // and the "no answer" timer must not fire mid-call.
                            cancelRingTimeout()
                            cancelIncomingTimeout()
                            cancelConnectionTimeout()
                            if (current.phase != CallPhase.CONNECTED) {
                                activeCallId?.let { callId ->
                                    viewModelScope.launch { runCatching { callRepository.markConnected(callId) } }
                                }
                            }
                            // Conversation audio is about to begin: the ringtone /
                            // ringback must stop before the first word is spoken.
                            callSoundPlayer.stop()
                            CallPhase.CONNECTED
                        }
                    }
                    current.copy(
                        peers = peers,
                        phase = nextPhase,
                        connectionQuality = peers.firstOrNull()?.connectionQuality
                            ?: current.connectionQuality,
                    )
                }
            }
        }
        viewModelScope.launch {
            liveKitCallManager.isMicrophoneEnabled.collect { enabled ->
                _state.update { it.copy(isMuted = !enabled) }
            }
        }
        viewModelScope.launch {
            liveKitCallManager.isCameraEnabled.collect { enabled ->
                _state.update { it.copy(isVideoEnabled = enabled) }
            }
        }
        viewModelScope.launch {
            liveKitCallManager.isSpeakerOn.collect { enabled ->
                _state.update { it.copy(isSpeakerOn = enabled) }
            }
        }
        viewModelScope.launch {
            liveKitCallManager.callEnded.collect { info -> onCallEnded(info) }
        }
    }

    /**
     * Reacts to the peer's signalling. A hang-up, reject or busy answer from the
     * other side has to end the call locally too, otherwise the room would stay
     * open until the SDK's own timeout.
     */
    private fun observeSignaling() {
        viewModelScope.launch {
            callSignalingCoordinator.signals.collect { signal -> onSignal(signal) }
        }
    }

    private fun onSignal(signal: CallSignal) {
        val selfId = authRepository.sessionFlow.value?.userId ?: return
        if (signal.fromUserId == selfId) return
        val callId = activeCallId ?: return
        if (signal.callId != callId || signal.toUserId != selfId) return
        if (signal.fromUserId != _state.value.peerId) return
        when (signal.kind) {
            CallSignalKind.ACCEPT -> {
                if (_state.value.phase == CallPhase.OUTGOING_RINGING) {
                    cancelRingTimeout()
                    callSoundPlayer.stop()
                    _state.update { it.copy(phase = CallPhase.CONNECTING) }
                    startConnectionTimeout()
                }
            }
            CallSignalKind.REJECT -> {
                liveKitCallManager.disconnect()
                finalizeCall(CallStatus.REJECTED)
            }
            CallSignalKind.BUSY -> {
                liveKitCallManager.disconnect()
                finalizeCall(CallStatus.BUSY)
            }
            CallSignalKind.HANGUP -> {
                liveKitCallManager.disconnect()
                finalizeCall(CallStatus.ENDED)
            }

            else -> Unit
        }
    }

    private fun observeHistory() {
        viewModelScope.launch {
            callRepository.observeHistory().collect { calls ->
                _state.update { it.copy(history = calls, isLoading = false) }
            }
        }
    }

    fun refreshHistory() {
        viewModelScope.launch {
            _state.update { it.copy(error = null) }
            runCatching { callRepository.syncHistory() }
                .onFailure { t ->
                    _state.update { it.copy(error = t.message ?: "Could not refresh call history") }
                }
        }
    }

    /** Removes a single entry from the call history list. */
    fun deleteCall(callId: String) {
        viewModelScope.launch {
            runCatching { callRepository.deleteCall(callId) }
        }
    }

    /** Clears the entire call history list. */
    fun clearHistory() {
        viewModelScope.launch {
            runCatching { callRepository.clearHistory() }
        }
    }

    // ---- Outgoing ----------------------------------------------------------

    /**
     * Resolves the peer from the conversation, records the call session, rings the
     * callee over Supabase Realtime and joins the LiveKit room.
     *
     * The caller joins the room immediately so that the callee can start
     * publishing the moment they accept; the UI keeps showing "Ringing\u2026" until a
     * remote participant actually appears.
     */
    fun startCallForConversation(conversationId: String, isVideo: Boolean) {
        val session = authRepository.sessionFlow.value ?: return
        val currentUserId = session.userId
        if (_state.value.phase in setOf(CallPhase.CONNECTING, CallPhase.OUTGOING_RINGING, CallPhase.INCOMING_RINGING, CallPhase.CONNECTED)) return
        _state.update {
            it.copy(
                phase = CallPhase.CONNECTING,
                activeCall = null,
                callId = null,
                peerId = null,
                peerName = null,
                peerAvatar = null,
                peers = emptyList(),
                elapsedSeconds = 0L,
                conversationId = conversationId,
                isVideoCall = isVideo,
                isVideoEnabled = isVideo,
                error = null,
            )
        }
        setupJob = viewModelScope.launch {
            try {
                liveKitCallManager.ensureInitialized()
                val conversation = withTimeout(10_000L) {
                    conversationRepository.observeConversation(conversationId).filterNotNull().first()
                }
                val peer = conversation?.otherMember(currentUserId)
                val peerId = peer?.userId ?: error("This conversation has no callable peer.")
                val peerName = peer?.displayName?.takeIf { it.isNotBlank() }
                    ?: conversation?.displayTitle(currentUserId) ?: "GaGa User"
                val peerAvatar = peer?.avatar
                _state.update { it.copy(peerId = peerId, peerName = peerName, peerAvatar = peerAvatar) }
                val type = if (isVideo) CallType.VIDEO else CallType.AUDIO

                when (
                    val result = withTimeout(15_000L) { callRepository.startCall(
                        conversationId = conversationId,
                        initiatorId = currentUserId,
                        peerId = peerId,
                        peerName = peerName,
                        peerAvatar = peerAvatar,
                        type = type,
                    ) }
                ) {
                    is AppResult.Success -> {
                        val callId = result.data.id
                        activeCallId = callId
                        _state.update {
                            it.copy(
                                phase = CallPhase.OUTGOING_RINGING,
                                activeCall = result.data,
                                callId = callId,
                                peerId = peerId,
                                peerName = peerName,
                                peerAvatar = peerAvatar,
                                isVideoCall = isVideo,
                                isVideoEnabled = isVideo,
                                elapsedSeconds = 0L,
                            )
                        }
                        startRingTimeout()
                        // Ring the callee's personal inbox, then join the per-call
                        // topic so both sides hear accept/reject/hang-up.
                        callSignalingCoordinator.joinCall(callId)
                        callSignalingCoordinator.ring(
                            toUserId = peerId,
                            signal = CallSignalingCoordinator.invite(
                                callId = callId,
                                conversationId = conversationId,
                                fromUserId = currentUserId,
                                toUserId = peerId,
                                payload = buildJsonObject {
                                    put("name", session.displayName ?: "GaGa User")
                                    put("video", isVideo)
                                    put("conversationId", conversationId)
                                },
                            ),
                        )
                        val joined = liveKitCallManager.connect(
                            callId = callId,
                            userId = currentUserId,
                            userName = session.displayName ?: "GaGa User",
                            isVideo = isVideo,
                        )
                        if (joined) {
                            _state.update { it.copy(callLaunched = true) }
                            // Let the SDK acquire audio first so it cannot immediately
                            // interrupt ringback with its initial focus request.
                            if (_state.value.phase == CallPhase.OUTGOING_RINGING) {
                                callSoundPlayer.startOutgoing()
                            }
                        } else {
                            liveKitCallManager.disconnect()
                            finalizeCall(CallStatus.FAILED, liveKitCallManager.lastError
                                ?: "Could not start the call. Please try again.")
                        }
                    }

                    is AppResult.Failure ->
                        _state.update { it.copy(phase = CallPhase.ENDED, error = result.error.toUserMessage()) }

                    AppResult.Loading -> Unit
                }
            } catch (timeout: TimeoutCancellationException) {
                liveKitCallManager.disconnect()
                finalizeCall(CallStatus.FAILED, "Call setup timed out. Please try again.")
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                liveKitCallManager.disconnect()
                finalizeCall(CallStatus.FAILED, "Could not start the call. Please try again.")
            }
        }
    }

    // ---- Incoming ----------------------------------------------------------

    /**
     * Prepares the incoming-call surface. Called from the incoming-call route,
     * which is reached either from the full-screen call notification or from a
     * live Realtime invite while the app is in the foreground.
     *
     * Only signalling is joined here: the callee enters the LiveKit room when they
     * actually accept, so a declined call never costs media time.
     */
    fun prepareIncomingCall(conversationId: String, callId: String?, isVideo: Boolean) {
        val session = authRepository.sessionFlow.value ?: return
        val currentUserId = session.userId
        if (_state.value.phase == CallPhase.CONNECTED ||
            _state.value.phase == CallPhase.CONNECTING ||
            _state.value.phase == CallPhase.OUTGOING_RINGING
        ) {
            return
        }
        if (callId.isNullOrBlank()) return
        if (_state.value.phase == CallPhase.INCOMING_RINGING) return
        activeCallId = callId
        callSignalingCoordinator.joinCall(callId)
        _state.update {
            it.copy(
                phase = CallPhase.INCOMING_RINGING,
                callId = callId,
                conversationId = conversationId,
                isVideoCall = isVideo,
                isVideoEnabled = false,
                elapsedSeconds = 0L,
                error = null,
            )
        }
        startIncomingTimeout()
        // Ring the device: this is the sound that was missing. It loops until the
        // call is accepted, rejected, cancelled, times out or otherwise ends.
        callSoundPlayer.startIncoming()
        viewModelScope.launch {
            val conversation = withTimeoutOrNull(10_000L) {
                conversationRepository.observeConversation(conversationId).filterNotNull().first()
            }
            if (activeCallId != callId) return@launch
            val peer = conversation?.otherMember(currentUserId)
            _state.update {
                it.copy(
                    peerId = peer?.userId,
                    peerName = peer?.displayName?.takeIf { name -> name.isNotBlank() }
                        ?: conversation?.displayTitle(currentUserId) ?: "GaGa User",
                    peerAvatar = peer?.avatar,
                )
            }
        }
    }

    /** Accepts an incoming call: joins the room and tells the caller we're in. */
    fun acceptCall() {
        if (_state.value.phase != CallPhase.INCOMING_RINGING) return
        cancelIncomingTimeout()
        val callId = activeCallId ?: _state.value.callId
        if (callId == null) {
            _state.update {
                it.copy(phase = CallPhase.ENDED, error = "This call is no longer available.")
            }
            return
        }
        val session = authRepository.sessionFlow.value ?: return
        // The user answered: the ringtone must stop immediately, before the room
        // is even joined.
        callSoundPlayer.stop()
        _state.update { it.copy(phase = CallPhase.CONNECTING, error = null) }
        startConnectionTimeout()
        setupJob = viewModelScope.launch {
            try {
                liveKitCallManager.ensureInitialized()
                callSignalingCoordinator.joinCall(callId)
                broadcastSignal(CallSignalKind.ACCEPT)
                val joined = liveKitCallManager.connect(
                    callId = callId,
                    userId = session.userId,
                    userName = session.displayName ?: "GaGa User",
                    isVideo = _state.value.isVideoCall,
                )
                if (joined) {
                    _state.update { it.copy(callLaunched = true) }
                } else {
                    liveKitCallManager.disconnect()
                    finalizeCall(CallStatus.FAILED, liveKitCallManager.lastError ?: "Could not join the call.")
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                liveKitCallManager.disconnect()
                finalizeCall(CallStatus.FAILED, "Could not join the call. Please try again.")
            }
        }
    }

    // ---- In-call controls --------------------------------------------------

    /** Ends the active call for both parties. */
    fun endCall() {
        // Cancelling before the callee answers is a distinct case: the callee is
        // still subscribed only to its personal inbox (it joins the per-call
        // topic when it accepts), so a plain per-call hang-up would never reach
        // it and its phone would keep ringing. Route it through the inbox too.
        if (_state.value.phase == CallPhase.OUTGOING_RINGING) {
            cancelOutgoingRing(error = null)
            return
        }
        broadcastSignal(CallSignalKind.HANGUP)
        liveKitCallManager.disconnect()
        finalizeCall(CallStatus.ENDED)
    }

    /** Declines an incoming call. */
    fun rejectCall() {
        broadcastSignal(CallSignalKind.REJECT)
        liveKitCallManager.disconnect()
        finalizeCall(CallStatus.REJECTED)
    }

    fun toggleMute() {
        val nextMuted = !_state.value.isMuted
        _state.update { it.copy(isMuted = nextMuted) }
        viewModelScope.launch { liveKitCallManager.setMicrophoneEnabled(!nextMuted) }
    }

    fun toggleSpeaker() {
        val nextSpeaker = !_state.value.isSpeakerOn
        _state.update { it.copy(isSpeakerOn = nextSpeaker) }
        liveKitCallManager.setSpeakerOn(nextSpeaker)
    }

    fun toggleVideo() {
        val nextVideo = !_state.value.isVideoEnabled
        _state.update { it.copy(isVideoEnabled = nextVideo) }
        viewModelScope.launch { liveKitCallManager.setCameraEnabled(nextVideo) }
    }

    fun switchCamera() {
        liveKitCallManager.switchCamera()
    }

    // ---- Video renderers ---------------------------------------------------

    /** Binds the local camera preview to [renderer]. */
    fun attachLocalVideo(renderer: SurfaceViewRenderer) {
        liveKitCallManager.attachLocalVideo(renderer)
    }

    /** Binds the remote participant's camera to [renderer]. */
    fun attachRemoteVideo(renderer: SurfaceViewRenderer, identity: String) {
        liveKitCallManager.attachRemoteVideo(renderer, identity)
    }

    /** Detaches [renderer] from whatever track is currently feeding it. */
    fun detachRenderer(renderer: SurfaceViewRenderer) {
        liveKitCallManager.detachRenderer(renderer)
    }

    /**
     * Initialises [renderer] against the room's EGL context. LiveKit requires this
     * before a renderer can accept frames \u2014 without it the video surface stays
     * black. Safe to call repeatedly; the SDK ignores a second init.
     */
    fun initVideoRenderer(renderer: SurfaceViewRenderer) {
        runCatching { liveKitCallManager.room?.initVideoRenderer(renderer) }
    }

    fun dismissEnded() {
        _state.update {
            it.copy(
                phase = CallPhase.IDLE,
                activeCall = null,
                callId = null,
                elapsedSeconds = 0L,
                callLaunched = false,
                error = null,
            )
        }
    }

    // ---- Internals ---------------------------------------------------------

    private fun onCallEnded(info: CallEndedInfo) {
        if (activeCallId == null || info.initiatedLocally) return
        // `endCall()` / `rejectCall()` already finalised the call synchronously, so
        // this only has work to do when the room died on its own (peer hung up,
        // network dropped, SFU failure).
        val status = when {
            info.error != null -> CallStatus.FAILED
            _state.value.elapsedSeconds > 0L -> CallStatus.ENDED
            else -> CallStatus.MISSED
        }
        finalizeCall(status, error = info.error)
    }

    /** Publishes a signalling message for the in-flight call. Best effort. */
    private fun broadcastSignal(kind: CallSignalKind) {
        val callId = activeCallId ?: return
        val session = authRepository.sessionFlow.value ?: return
        val peerId = _state.value.peerId ?: return
        callSignalingCoordinator.send(
            CallSignal(
                callId = callId,
                conversationId = _state.value.conversationId.orEmpty(),
                fromUserId = session.userId,
                toUserId = peerId,
                kind = kind,
                payload = null,
                createdAt = System.currentTimeMillis(),
            ),
        )
    }

    /**
     * Cancels an outgoing call that has not been answered yet. The hang-up is
     * published on the per-call topic (for any client that already joined) *and*
     * on the callee's personal inbox, because a still-ringing callee has not
     * joined the per-call topic and would otherwise keep ringing. The call is
     * recorded as MISSED, matching what the user actually experienced.
     */
    private fun cancelOutgoingRing(error: String?) {
        val session = authRepository.sessionFlow.value
        val peerId = _state.value.peerId
        val callId = activeCallId
        if (session != null && peerId != null && callId != null) {
            callSignalingCoordinator.ring(
                toUserId = peerId,
                signal = CallSignal(
                    callId = callId,
                    conversationId = _state.value.conversationId.orEmpty(),
                    fromUserId = session.userId,
                    toUserId = peerId,
                    kind = CallSignalKind.HANGUP,
                    payload = null,
                    createdAt = System.currentTimeMillis(),
                ),
            )
        }
        broadcastSignal(CallSignalKind.HANGUP)
        liveKitCallManager.disconnect()
        finalizeCall(CallStatus.MISSED, error = error)
    }

    /**
     * Arms the "no answer" timer for an outgoing call. Fires once after
     * [RING_TIMEOUT_MS]; if the call is still ringing by then it is cancelled.
     */
    private fun startRingTimeout() {
        cancelRingTimeout()
        ringTimeoutJob = viewModelScope.launch {
            delay(RING_TIMEOUT_MS)
            if (_state.value.phase == CallPhase.OUTGOING_RINGING) {
                // Null the handle first so finalizeCall()'s cancel is a no-op and
                // cannot cancel this coroutine out from under itself.
                ringTimeoutJob = null
                cancelOutgoingRing(error = "No answer")
            }
        }
    }

    private fun cancelRingTimeout() {
        ringTimeoutJob?.cancel()
        ringTimeoutJob = null
    }

    /**
     * Arms the timer that stops an incoming call ringing forever when the caller
     * never withdraws the invite (e.g. their process died). Fires once after
     * [RING_TIMEOUT_MS].
     */
    private fun startIncomingTimeout() {
        cancelIncomingTimeout()
        incomingTimeoutJob = viewModelScope.launch {
            delay(RING_TIMEOUT_MS)
            if (_state.value.phase == CallPhase.INCOMING_RINGING) {
                incomingTimeoutJob = null
                finalizeCall(CallStatus.MISSED)
            }
        }
    }

    private fun cancelIncomingTimeout() {
        incomingTimeoutJob?.cancel()
        incomingTimeoutJob = null
    }

    /** A joined SFU room without the peer is not an answered call. */
    private fun startConnectionTimeout() {
        cancelConnectionTimeout()
        val callId = activeCallId ?: return
        connectionTimeoutJob = viewModelScope.launch {
            delay(CONNECTION_TIMEOUT_MS)
            if (activeCallId == callId && _state.value.phase == CallPhase.CONNECTING) {
                connectionTimeoutJob = null
                broadcastSignal(CallSignalKind.HANGUP)
                liveKitCallManager.disconnect()
                finalizeCall(CallStatus.FAILED, "The other person could not connect. Please try again.")
            }
        }
    }

    private fun cancelConnectionTimeout() {
        connectionTimeoutJob?.cancel()
        connectionTimeoutJob = null
    }

    /** Persists the final status + duration and resets the UI to the ended state. */
    private fun finalizeCall(status: CallStatus, error: String? = null) {
        setupJob?.cancel()
        setupJob = null
        cancelRingTimeout()
        cancelIncomingTimeout()
        cancelConnectionTimeout()
        // Single choke point for every terminal path (reject, cancel, hang-up,
        // busy, timeout, failure): the ring can never outlive its call.
        callSoundPlayer.stop()
        val callId = activeCallId
        activeCallId = null
        if (callId != null) callSignalingCoordinator.leaveCall(callId)

        val durationMs = _state.value.elapsedSeconds * 1000L
        // A call that never connected (0 seconds of media) is not a completed
        // call. Recording it as ENDED produced the misleading "Voice call \u00b7 0m 0s"
        // bubble; classifying it as MISSED is what the user actually experienced.
        val effectiveStatus =
            if (status == CallStatus.ENDED && durationMs <= 0L) CallStatus.MISSED else status

        // Flip the UI to "ended" synchronously so the call surface closes without
        // waiting on the network write; persistence happens in the background.
        _state.update {
            it.copy(
                phase = CallPhase.ENDED,
                activeCall = null,
                callLaunched = false,
                callingReady = false,
                peers = emptyList(),
                error = error,
            )
        }

        if (callId == null) return
        viewModelScope.launch {
            runCatching { callRepository.endCall(callId, effectiveStatus, durationMs) }
        }
    }

    override fun onCleared() {
        // The ViewModel scope is cancelled for us, but the ringtone lives in a
        // singleton and would otherwise keep playing after the screen is gone.
        callSoundPlayer.stop()
        super.onCleared()
    }

    private companion object {
        /**
         * How long an outgoing call rings before it is treated as unanswered, and
         * how long an incoming invite may ring before it is auto-dismissed. 45s
         * matches the platform dialer's default and is long enough for a callee
         * to reach their phone.
         */
        const val RING_TIMEOUT_MS = 45_000L
        const val CONNECTION_TIMEOUT_MS = 45_000L
    }
}
