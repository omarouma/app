package app.gagachat.core.data.call

import app.gagachat.core.model.CallSignal
import app.gagachat.core.model.CallSignalKind
import kotlinx.coroutines.flow.Flow

/**
 * Media engine abstraction (PDF §8). The call state machine and signaling layer
 * are completely decoupled from the concrete WebRTC implementation: the UI and
 * repositories only ever see this interface. A real `org.webrtc` peer-connection
 * engine can be dropped in behind it without touching the call lifecycle, and a
 * no-op engine keeps the app fully functional on devices/builds where the native
 * WebRTC binaries are not bundled.
 */
interface CallMediaEngine {

    /** Emits engine-level events (ICE candidates, connection state, remote track). */
    val events: Flow<MediaEngineEvent>

    /**
     * Creates the peer connection and local media for [callId]. [asCaller] decides
     * whether an SDP offer is generated (caller) or awaited (callee).
     */
    suspend fun start(callId: String, asCaller: Boolean, video: Boolean)

    /** Applies a remote SDP offer and produces an answer. */
    suspend fun setRemoteOffer(callId: String, sdp: String)

    /** Applies a remote SDP answer to a locally-created offer. */
    suspend fun setRemoteAnswer(callId: String, sdp: String)

    /** Adds a remote ICE candidate. */
    suspend fun addIceCandidate(callId: String, candidate: String)

    suspend fun setMicrophoneEnabled(enabled: Boolean)
    suspend fun setCameraEnabled(enabled: Boolean)
    suspend fun setSpeakerEnabled(enabled: Boolean)

    /** Tears down the peer connection and releases all media resources. */
    suspend fun stop(callId: String)
}

/** Events emitted by the media engine back to the call state machine. */
sealed interface MediaEngineEvent {
    /** A locally-gathered ICE candidate to relay to the peer. */
    data class LocalIceCandidate(val callId: String, val candidate: String) : MediaEngineEvent

    /** A local SDP offer/answer to relay to the peer. */
    data class LocalSdp(val callId: String, val sdp: String, val isOffer: Boolean) : MediaEngineEvent

    /** The peer connection reached a connected/stable state. */
    data class Connected(val callId: String) : MediaEngineEvent

    /** The peer connection failed or was closed. */
    data class Disconnected(val callId: String, val reason: String? = null) : MediaEngineEvent
}

/**
 * Signaling transport (PDF §8). Sends and receives [CallSignal]s for a call room.
 * The default implementation rides the Supabase Realtime broadcast channel; the
 * interface keeps the call state machine transport-agnostic.
 */
interface CallSignaling {
    /** Subscribes to signals for [callId]; call [unsubscribe] when the call ends. */
    fun subscribe(callId: String): Flow<CallSignal>

    /** Relays a signal to the peer. Fire-and-forget. */
    suspend fun send(signal: CallSignal)

    fun unsubscribe(callId: String)

    /** Topic name used for a call room. */
    fun topicFor(callId: String): String = "call:$callId"

    companion object {
        fun signal(
            callId: String,
            conversationId: String,
            fromUserId: String,
            toUserId: String,
            kind: CallSignalKind,
            payload: String? = null,
            createdAt: Long = 0L,
        ) = CallSignal(
            callId = callId,
            conversationId = conversationId,
            fromUserId = fromUserId,
            toUserId = toUserId,
            kind = kind,
            payload = payload,
            createdAt = createdAt,
        )
    }
}
