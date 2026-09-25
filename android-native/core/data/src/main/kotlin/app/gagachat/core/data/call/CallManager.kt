package app.gagachat.core.data.call

import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.model.CallSignal
import app.gagachat.core.model.CallSignalKind
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Coordinates the WebRTC signaling + media engine for a single active call
 * (PDF §8). It is transport- and engine-agnostic: it consumes [CallSignaling]
 * and [CallMediaEngine] and exposes a single event stream the call state machine
 * (the feature ViewModel) reacts to. Keeping this in the data layer means the
 * signaling protocol never leaks into Compose.
 */
@Singleton
class CallManager @Inject constructor(
    private val signaling: CallSignaling,
    private val mediaEngine: CallMediaEngine,
    private val timeProvider: TimeProvider,
    private val logger: AppLogger,
) {

    /** High-level events surfaced to the call state machine. */
    sealed interface CallEvent {
        data class RemoteRinging(val callId: String) : CallEvent
        data class RemoteAccepted(val callId: String) : CallEvent
        data class RemoteRejected(val callId: String) : CallEvent
        data class RemoteBusy(val callId: String) : CallEvent
        data class RemoteHangup(val callId: String) : CallEvent
        data class Connected(val callId: String) : CallEvent
        data class Failed(val callId: String, val reason: String?) : CallEvent
    }

    private val _events = MutableSharedFlow<CallEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<CallEvent> = _events.asSharedFlow()

    private var signalJob: Job? = null
    private var mediaJob: Job? = null
    private var activeCallId: String? = null
    private var selfUserId: String = ""
    private var conversationId: String = ""
    private var peerUserId: String = ""

    /**
     * Begins a call: subscribes to the signaling topic, starts the media engine
     * and (when [asCaller]) sends the initial RINGING signal.
     */
    fun begin(
        scope: CoroutineScope,
        callId: String,
        conversationId: String,
        selfUserId: String,
        peerUserId: String,
        asCaller: Boolean,
        video: Boolean,
    ) {
        end(scope) // ensure any previous call is torn down
        this.activeCallId = callId
        this.conversationId = conversationId
        this.selfUserId = selfUserId
        this.peerUserId = peerUserId

        signalJob = scope.launch {
            signaling.subscribe(callId).collect { signal -> handleSignal(signal) }
        }
        mediaJob = scope.launch {
            mediaEngine.events.collect { event ->
                when (event) {
                    is MediaEngineEvent.LocalSdp -> {
                        signaling.send(
                            CallSignaling.signal(
                                callId = callId,
                                conversationId = conversationId,
                                fromUserId = selfUserId,
                                toUserId = peerUserId,
                                kind = if (event.isOffer) CallSignalKind.OFFER else CallSignalKind.ANSWER,
                                payload = event.sdp,
                                createdAt = timeProvider.nowMillis(),
                            ),
                        )
                    }
                    is MediaEngineEvent.LocalIceCandidate -> {
                        signaling.send(
                            CallSignaling.signal(
                                callId = callId,
                                conversationId = conversationId,
                                fromUserId = selfUserId,
                                toUserId = peerUserId,
                                kind = CallSignalKind.ICE_CANDIDATE,
                                payload = event.candidate,
                                createdAt = timeProvider.nowMillis(),
                            ),
                        )
                    }
                    is MediaEngineEvent.Connected -> _events.tryEmit(CallEvent.Connected(event.callId))
                    is MediaEngineEvent.Disconnected ->
                        _events.tryEmit(CallEvent.Failed(event.callId, event.reason))
                }
            }
        }
        scope.launch { mediaEngine.start(callId, asCaller = asCaller, video = video) }
        if (asCaller) {
            scope.launch {
                signaling.send(
                    CallSignaling.signal(
                        callId = callId,
                        conversationId = conversationId,
                        fromUserId = selfUserId,
                        toUserId = peerUserId,
                        kind = CallSignalKind.RINGING,
                        createdAt = timeProvider.nowMillis(),
                    ),
                )
            }
        }
    }

    /** Sends an ACCEPT signal and starts media negotiation as the callee. */
    fun accept(scope: CoroutineScope) {
        val callId = activeCallId ?: return
        scope.launch {
            signaling.send(
                CallSignaling.signal(
                    callId = callId,
                    conversationId = conversationId,
                    fromUserId = selfUserId,
                    toUserId = peerUserId,
                    kind = CallSignalKind.ACCEPT,
                    createdAt = timeProvider.nowMillis(),
                ),
            )
            mediaEngine.start(callId, asCaller = false, video = false)
        }
    }

    /** Sends a REJECT signal and tears the call down. */
    fun reject(scope: CoroutineScope) {
        val callId = activeCallId ?: return
        scope.launch {
            signaling.send(
                CallSignaling.signal(
                    callId = callId,
                    conversationId = conversationId,
                    fromUserId = selfUserId,
                    toUserId = peerUserId,
                    kind = CallSignalKind.REJECT,
                    createdAt = timeProvider.nowMillis(),
                ),
            )
        }
        end(scope)
    }

    /** Sends a HANGUP signal and tears the call down. */
    fun hangup(scope: CoroutineScope) {
        val callId = activeCallId ?: return
        scope.launch {
            signaling.send(
                CallSignaling.signal(
                    callId = callId,
                    conversationId = conversationId,
                    fromUserId = selfUserId,
                    toUserId = peerUserId,
                    kind = CallSignalKind.HANGUP,
                    createdAt = timeProvider.nowMillis(),
                ),
            )
        }
        end(scope)
    }

    fun setMuted(scope: CoroutineScope, muted: Boolean) =
        scope.launch { mediaEngine.setMicrophoneEnabled(!muted) }

    fun setSpeaker(scope: CoroutineScope, on: Boolean) =
        scope.launch { mediaEngine.setSpeakerEnabled(on) }

    fun setCamera(scope: CoroutineScope, on: Boolean) =
        scope.launch { mediaEngine.setCameraEnabled(on) }

    /** Tears down signaling + media for the active call. */
    fun end(scope: CoroutineScope) {
        val callId = activeCallId ?: return
        signalJob?.cancel(); signalJob = null
        mediaJob?.cancel(); mediaJob = null
        signaling.unsubscribe(callId)
        scope.launch { mediaEngine.stop(callId) }
        activeCallId = null
    }

    private fun handleSignal(signal: CallSignal) {
        when (signal.kind) {
            CallSignalKind.RINGING -> _events.tryEmit(CallEvent.RemoteRinging(signal.callId))
            CallSignalKind.ACCEPT -> _events.tryEmit(CallEvent.RemoteAccepted(signal.callId))
            CallSignalKind.REJECT -> _events.tryEmit(CallEvent.RemoteRejected(signal.callId))
            CallSignalKind.BUSY -> _events.tryEmit(CallEvent.RemoteBusy(signal.callId))
            CallSignalKind.HANGUP -> _events.tryEmit(CallEvent.RemoteHangup(signal.callId))
            CallSignalKind.OFFER -> mediaScope?.launch {
                signal.payload?.let { mediaEngine.setRemoteOffer(signal.callId, it) }
            }
            CallSignalKind.ANSWER -> mediaScope?.launch {
                signal.payload?.let { mediaEngine.setRemoteAnswer(signal.callId, it) }
            }
            CallSignalKind.ICE_CANDIDATE -> mediaScope?.launch {
                signal.payload?.let { mediaEngine.addIceCandidate(signal.callId, it) }
            }
        }
    }

    private var mediaScope: CoroutineScope? = null

    /** Binds the coroutine scope used for media negotiation side-effects. */
    fun bindScope(scope: CoroutineScope) {
        mediaScope = scope
    }
}
