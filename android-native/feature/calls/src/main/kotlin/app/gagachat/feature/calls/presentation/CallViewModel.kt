package app.gagachat.feature.calls.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.CallRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.model.CallSession
import app.gagachat.core.model.CallStatus
import app.gagachat.core.model.CallType
import app.gagachat.core.ui.util.toUserMessage
import app.gagachat.feature.calls.call.ZegoCallManager
import com.zegocloud.uikit.prebuilt.call.ZegoUIKitPrebuiltCallService
import com.zegocloud.uikit.prebuilt.call.event.ZegoCallEndReason
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * High-level call lifecycle used by the UI (PDF \u00a78). Real audio/video media and
 * the ringing/accept/hang-up flow are handled by the ZEGOCLOUD Call Kit via
 * [ZegoCallManager]; this ViewModel owns the *durable* side of calling \u2014 call
 * history, the CALL_EVENT chat item, and the final status/duration \u2014 so the two
 * concerns stay cleanly separated.
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
    val isMuted: Boolean = false,
    val isSpeakerOn: Boolean = false,
    val isVideoEnabled: Boolean = true,
    val elapsedSeconds: Long = 0L,
    /** True once the Call Kit UI has been launched for an outgoing call. */
    val callLaunched: Boolean = false,
)

@HiltViewModel
class CallViewModel @Inject constructor(
    private val callRepository: CallRepository,
    private val authRepository: AuthRepository,
    private val conversationRepository: ConversationRepository,
    private val zegoCallManager: ZegoCallManager,
) : ViewModel() {

    private val _state = MutableStateFlow(CallUiState())
    val state: StateFlow<CallUiState> = _state.asStateFlow()

    private var timerJob: Job? = null

    /** The server call id of the in-flight call, persisted when it finishes. */
    private var activeCallId: String? = null

    init {
        observeHistory()
        refreshHistory()
        observeCallEvents()
        viewModelScope.launch {
            zegoCallManager.durationSeconds.collect { seconds ->
                if (activeCallId != null) _state.update {
                    it.copy(elapsedSeconds = seconds, phase = if (seconds > 0) CallPhase.CONNECTED else it.phase)
                }
            }
        }
    }

    /**
     * Persists the outcome of every call the Call Kit reports as finished, so the
     * call history and the CALL_EVENT chat item always reflect reality even when
     * the call was answered or ended inside the SDK's own UI.
     */
    private fun observeCallEvents() {
        viewModelScope.launch {
            zegoCallManager.callEnded.collect { reason -> onCallEnded(reason) }
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

    /**
     * Resolves the peer from the conversation, records the call session and hands
     * the real call over to the ZEGOCLOUD Call Kit (which shows its own outgoing
     * call UI and performs the media negotiation).
     */
    fun startCallForConversation(conversationId: String, isVideo: Boolean) {
        val session = authRepository.sessionFlow.value ?: return
        val currentUserId = session.userId
        if (_state.value.phase in setOf(CallPhase.CONNECTING, CallPhase.OUTGOING_RINGING, CallPhase.CONNECTED)) return
        _state.update { it.copy(phase = CallPhase.CONNECTING, error = null) }
        viewModelScope.launch {
            zegoCallManager.init(currentUserId, session.displayName ?: "GaGa User")
            if (!zegoCallManager.isInitialized()) {
                _state.update { it.copy(phase = CallPhase.ENDED, error = zegoCallManager.lastError) }
                return@launch
            }
            _state.update { it.copy(error = null) }
            val conversation = conversationRepository.observeConversation(conversationId).first()
            val peer = conversation?.otherMember(currentUserId)
            val peerId = peer?.userId
            val peerName = peer?.displayName?.takeIf { it.isNotBlank() }
                ?: conversation?.displayTitle(currentUserId) ?: "GaGa User"
            val peerAvatar = peer?.avatar
            val type = if (isVideo) CallType.VIDEO else CallType.AUDIO

            when (
                val result = callRepository.startCall(
                    conversationId = conversationId,
                    initiatorId = currentUserId,
                    peerId = peerId,
                    peerName = peerName,
                    peerAvatar = peerAvatar,
                    type = type,
                )
            ) {
                is AppResult.Success -> {
                    activeCallId = result.data.id
                    _state.update {
                        it.copy(
                            phase = CallPhase.OUTGOING_RINGING,
                            activeCall = result.data,
                            isVideoEnabled = isVideo,
                            elapsedSeconds = 0L,
                        )
                    }
                    if (peerId == null) {
                        _state.update { it.copy(error = "This conversation has no callable peer.") }
                        return@launch
                    }
                    val launched = zegoCallManager.startCall(peerId, peerName, isVideo, result.data.id)
                    if (launched) {
                        // Duration comes from the SDK, excluding ring time.
                        _state.update { it.copy(callLaunched = true) }
                    } else {
                        // Do not leave a durable server row stuck in ringing when
                        // the SDK could not dispatch the invitation.
                        callRepository.endCall(result.data.id, CallStatus.FAILED, 0L)
                        activeCallId = null
                        stopTimer()
                        _state.update {
                            it.copy(
                                phase = CallPhase.ENDED,
                                activeCall = null,
                                callLaunched = false,
                                error = zegoCallManager.lastError ?: "Could not start the call. Please try again.",
                            )
                        }
                    }
                }

                is AppResult.Failure ->
                    _state.update { it.copy(phase = CallPhase.ENDED, error = result.error.toUserMessage()) }

                AppResult.Loading -> Unit
            }
        }
    }

    /** Ends the active call (also stops the Call Kit UI). */
    fun endCall() {
        zegoCallManager.endCall()
        finalizeCall(CallStatus.ENDED)
    }

    /** Declines/ends an incoming call. */
    fun rejectCall() {
        zegoCallManager.endCall()
        finalizeCall(CallStatus.REJECTED)
    }

    /**
     * Accepting is handled by the Call Kit's own incoming-call UI, so this is a
     * no-op kept for API compatibility with the call surface.
     */
    fun acceptCall() = Unit

    fun toggleMute() {
        val next = !_state.value.isMuted
        _state.update { it.copy(isMuted = next) }
        runCatching { ZegoUIKitPrebuiltCallService.openMicrophone(!next) }
    }

    fun toggleSpeaker() {
        val next = !_state.value.isSpeakerOn
        _state.update { it.copy(isSpeakerOn = next) }
        runCatching { ZegoUIKitPrebuiltCallService.setAudioOutputToSpeaker(next) }
    }

    fun toggleVideo() {
        val next = !_state.value.isVideoEnabled
        _state.update { it.copy(isVideoEnabled = next) }
        runCatching { ZegoUIKitPrebuiltCallService.openCamera(next) }
    }

    fun dismissEnded() {
        _state.update {
            it.copy(
                phase = CallPhase.IDLE,
                activeCall = null,
                elapsedSeconds = 0L,
                callLaunched = false,
                error = null,
            )
        }
    }

    private fun onCallEnded(status: CallStatus) {
        if (activeCallId != null) finalizeCall(status)
    }

    /** Persists the final status + duration and resets the UI to the ended state. */
    private fun finalizeCall(status: CallStatus) {
        stopTimer()
        val callId = activeCallId
        activeCallId = null
        if (callId == null) {
            _state.update {
                it.copy(phase = CallPhase.ENDED, activeCall = null, callLaunched = false)
            }
            return
        }
        val durationMs = _state.value.elapsedSeconds * 1000L
        viewModelScope.launch {
            callRepository.endCall(callId, status, durationMs)
            _state.update {
                it.copy(phase = CallPhase.ENDED, activeCall = null, callLaunched = false)
            }
        }
    }

    private fun startTimerIfNeeded() {
        if (timerJob?.isActive == true) return
        timerJob = viewModelScope.launch {
            while (true) {
                delay(1_000L)
                _state.update { it.copy(elapsedSeconds = it.elapsedSeconds + 1L) }
            }
        }
    }

    private fun stopTimer() {
        timerJob?.cancel()
        timerJob = null
    }

    override fun onCleared() {
        stopTimer()
        super.onCleared()
    }
}
