package app.gagachat.feature.calls.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.call.CallManager
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.CallRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.model.CallSession
import app.gagachat.core.model.CallStatus
import app.gagachat.core.model.CallType
import app.gagachat.core.ui.util.toUserMessage
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
 * High-level call lifecycle used by the UI (PDF §8). The media path (WebRTC) is
 * intentionally decoupled from this state machine; this drives signaling,
 * session persistence and the CALL_EVENT chat item.
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
)

@HiltViewModel
class CallViewModel @Inject constructor(
    private val callRepository: CallRepository,
    private val authRepository: AuthRepository,
    private val conversationRepository: ConversationRepository,
    private val callManager: CallManager,
) : ViewModel() {

    private val _state = MutableStateFlow(CallUiState())
    val state: StateFlow<CallUiState> = _state.asStateFlow()

    private var timerJob: Job? = null

    init {
        observeHistory()
        refreshHistory()
        callManager.bindScope(viewModelScope)
        observeCallEvents()
    }

    /**
     * Bridges WebRTC signaling/media events (from the data-layer [CallManager])
     * into the UI call state machine. The media path stays fully decoupled from
     * the state machine: the ViewModel never touches WebRTC directly.
     */
    private fun observeCallEvents() {
        viewModelScope.launch {
            callManager.events.collect { event ->
                when (event) {
                    is CallManager.CallEvent.RemoteRinging ->
                        _state.update { it.copy(phase = CallPhase.INCOMING_RINGING) }
                    is CallManager.CallEvent.RemoteAccepted ->
                        _state.update { it.copy(phase = CallPhase.CONNECTING) }
                    is CallManager.CallEvent.Connected -> onMediaConnected()
                    is CallManager.CallEvent.RemoteRejected,
                    is CallManager.CallEvent.RemoteBusy,
                    is CallManager.CallEvent.RemoteHangup ->
                        endCall()
                    is CallManager.CallEvent.Failed ->
                        _state.update {
                            it.copy(
                                phase = CallPhase.ENDED,
                                activeCall = null,
                                error = event.reason ?: "Call failed",
                            )
                        }
                }
            }
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

    /** Starts an outgoing call and moves the UI into the ringing phase. */
    fun startCall(
        conversationId: String,
        peerId: String?,
        peerName: String?,
        peerAvatar: String?,
        type: CallType,
    ) {
        val initiatorId = authRepository.sessionFlow.value?.userId ?: return
        viewModelScope.launch {
            when (
                val result = callRepository.startCall(
                    conversationId = conversationId,
                    initiatorId = initiatorId,
                    peerId = peerId,
                    peerName = peerName,
                    peerAvatar = peerAvatar,
                    type = type,
                )
            ) {
                is AppResult.Success -> {
                    _state.update {
                        it.copy(
                            phase = CallPhase.OUTGOING_RINGING,
                            activeCall = result.data,
                            isVideoEnabled = type == CallType.VIDEO,
                            elapsedSeconds = 0L,
                        )
                    }
                    // Begin signaling + media negotiation for the outgoing call.
                    if (peerId != null) {
                        callManager.begin(
                            scope = viewModelScope,
                            callId = result.data.id,
                            conversationId = conversationId,
                            selfUserId = initiatorId,
                            peerUserId = peerId,
                            asCaller = true,
                            video = type == CallType.VIDEO,
                        )
                    }
                }
                is AppResult.Failure -> {
                    _state.update { it.copy(error = result.error.toUserMessage()) }
                }
                AppResult.Loading -> Unit
            }
        }
    }

    /**
     * Resolves the peer from the conversation and starts an outgoing call. Used
     * when the call is initiated from the chat or profile surface, where only
     * the conversation id is known.
     */
    fun startCallForConversation(conversationId: String, isVideo: Boolean) {
        val currentUserId = authRepository.sessionFlow.value?.userId ?: return
        viewModelScope.launch {
            val conversation = conversationRepository.observeConversation(conversationId).first()
            val peer = conversation?.otherMember(currentUserId)
            startCall(
                conversationId = conversationId,
                peerId = peer?.userId,
                peerName = peer?.displayName ?: conversation?.displayTitle(currentUserId),
                peerAvatar = peer?.avatar,
                type = if (isVideo) CallType.VIDEO else CallType.AUDIO,
            )
        }
    }

    /** Accepts an incoming call (signaling ACCEPT + transition to CONNECTING). */
    fun acceptCall() {
        val call = _state.value.activeCall ?: return
        _state.update { it.copy(phase = CallPhase.CONNECTING) }
        // Media negotiation happens in the WebRTC layer; once connected the
        // signaling layer flips the phase to CONNECTED via onMediaConnected().
        callManager.accept(viewModelScope)
        startTimerIfNeeded(call)
    }

    /** Rejects an incoming call and records the REJECTED status. */
    fun rejectCall() {
        val call = _state.value.activeCall ?: return
        callManager.reject(viewModelScope)
        viewModelScope.launch {
            callRepository.endCall(call.id, CallStatus.REJECTED, null)
            _state.update { it.copy(phase = CallPhase.ENDED, activeCall = null) }
            stopTimer()
        }
    }

    /** Ends the active call, persisting duration and status. */
    fun endCall() {
        val call = _state.value.activeCall ?: return
        val durationMs = _state.value.elapsedSeconds * 1000L
        val status = when (_state.value.phase) {
            CallPhase.CONNECTED, CallPhase.CONNECTING -> CallStatus.ENDED
            CallPhase.OUTGOING_RINGING -> CallStatus.MISSED
            else -> CallStatus.ENDED
        }
        callManager.hangup(viewModelScope)
        viewModelScope.launch {
            callRepository.endCall(call.id, status, durationMs)
            _state.update { it.copy(phase = CallPhase.ENDED, activeCall = null) }
            stopTimer()
        }
    }

    /** Called by the media layer once the peer connection is established. */
    fun onMediaConnected() {
        if (_state.value.phase == CallPhase.CONNECTING || _state.value.phase == CallPhase.OUTGOING_RINGING) {
            _state.update { it.copy(phase = CallPhase.CONNECTED) }
            _state.value.activeCall?.let { startTimerIfNeeded(it) }
        }
    }

    fun toggleMute() = _state.update { it.copy(isMuted = !it.isMuted) }
    fun toggleSpeaker() = _state.update { it.copy(isSpeakerOn = !it.isSpeakerOn) }
    fun toggleVideo() = _state.update { it.copy(isVideoEnabled = !it.isVideoEnabled) }

    fun dismissEnded() {
        _state.update { it.copy(phase = CallPhase.IDLE, activeCall = null, elapsedSeconds = 0L) }
    }

    private fun startTimerIfNeeded(call: CallSession) {
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
