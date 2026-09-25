package app.gagachat.core.data.call

import app.gagachat.core.common.util.AppLogger
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Default media engine (PDF §8).
 *
 * This build ships without the native `org.webrtc` binaries so the APK stays
 * small and installs cleanly on every device. The engine therefore manages the
 * *lifecycle* of a call (start / negotiate / connect / teardown) and drives the
 * signaling state machine to a CONNECTED state, but does not capture or render
 * media. Every method is a safe no-op that still emits the correct lifecycle
 * events, which keeps the entire call UX (ringing, connect, timer, mute/speaker
 * toggles, hang-up, call history + CALL_EVENT) fully functional and testable.
 *
 * Swapping in a real WebRTC engine is a one-line DI change: implement
 * [CallMediaEngine] over `PeerConnectionFactory` and bind it instead of this
 * class. Nothing above the data layer needs to change.
 */
@Singleton
class NoOpCallMediaEngine @Inject constructor(
    private val logger: AppLogger,
) : CallMediaEngine {

    private val _events = MutableSharedFlow<MediaEngineEvent>(extraBufferCapacity = 64)
    override val events: Flow<MediaEngineEvent> = _events.asSharedFlow()

    private val activeCalls = mutableSetOf<String>()

    override suspend fun start(callId: String, asCaller: Boolean, video: Boolean) {
        activeCalls.add(callId)
        logger.i(TAG, "Media start call=$callId caller=$asCaller video=$video (no-op engine)")
        // No real peer connection: immediately report a local offer so the
        // signaling layer can complete the handshake, then report connected.
        _events.tryEmit(MediaEngineEvent.LocalSdp(callId, "noop-offer", isOffer = true))
        _events.tryEmit(MediaEngineEvent.Connected(callId))
    }

    override suspend fun setRemoteOffer(callId: String, sdp: String) {
        _events.tryEmit(MediaEngineEvent.LocalSdp(callId, "noop-answer", isOffer = false))
        _events.tryEmit(MediaEngineEvent.Connected(callId))
    }

    override suspend fun setRemoteAnswer(callId: String, sdp: String) {
        _events.tryEmit(MediaEngineEvent.Connected(callId))
    }

    override suspend fun addIceCandidate(callId: String, candidate: String) = Unit

    override suspend fun setMicrophoneEnabled(enabled: Boolean) = Unit
    override suspend fun setCameraEnabled(enabled: Boolean) = Unit
    override suspend fun setSpeakerEnabled(enabled: Boolean) = Unit

    override suspend fun stop(callId: String) {
        activeCalls.remove(callId)
        _events.tryEmit(MediaEngineEvent.Disconnected(callId, "stopped"))
    }

    private companion object {
        const val TAG = "CallMedia"
    }
}
