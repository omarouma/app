package app.gagachat.feature.calls.call

import android.content.Context
import android.os.SystemClock
import app.gagachat.core.common.BuildConfig
import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.network.rest.SupabaseRestApi
import com.twilio.audioswitch.AudioDevice
import dagger.hilt.android.qualifiers.ApplicationContext
import io.livekit.android.LiveKit
import io.livekit.android.LiveKitOverrides
import io.livekit.android.RoomOptions
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.renderer.SurfaceViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.participant.ConnectionQuality
import io.livekit.android.room.participant.Participant
import io.livekit.android.room.participant.RemoteParticipant
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoTrack
import io.livekit.android.util.LoggingLevel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Coarse lifecycle state of the LiveKit room, surfaced to the call UI.
 *
 * Replaces the old `ZimConnection` enum: LiveKit has no separate "signaling
 * connected" phase — the room itself is either connecting, live, reconnecting
 * or gone.
 */
enum class CallConnection { IDLE, CONNECTING, CONNECTED, RECONNECTING, DISCONNECTED, FAILED }

/**
 * Snapshot of a remote call participant for rendering the call surface.
 *
 * LiveKit exposes participants as live, mutable SDK objects; the UI layer only
 * ever sees this immutable projection so Compose can diff it cheaply.
 */
data class CallPeer(
    val identity: String,
    val name: String,
    val isSpeaking: Boolean,
    val isCameraEnabled: Boolean,
    val isMicrophoneEnabled: Boolean,
    val connectionQuality: ConnectionQuality,
)

/** Emitted once when a call finishes, so the UI can persist the final status. */
data class CallEndedInfo(
    val reason: String?,
    val error: String?,
    val initiatedLocally: Boolean,
)

/**
 * Thin, app-wide wrapper around the **LiveKit Android SDK** (PDF §8 — real
 * calling). It is the only place in the app that talks to the media transport.
 *
 * Division of responsibility:
 *  * **Media transport** — LiveKit (WebRTC SFU). Audio and video flow through
 *    the LiveKit Cloud project; the SDK handles ICE/DTLS/SFU negotiation.
 *  * **Call invitations / ring / accept / reject / hang-up** — our own Supabase
 *    Realtime broadcast channel (`CallSignalingCoordinator`). LiveKit is a pure
 *    SFU with no notion of "ringing", so the invite handshake is ours.
 *  * **Authorisation** — a short-lived, room-scoped LiveKit JWT minted by the
 *    `livekit-token` Supabase Edge Function. The LiveKit **API secret never
 *    ships in the APK**; the client only ever holds a token it cannot reuse for
 *    any other room or after it expires.
 *
 * Lifecycle: [connect] joins a call room, [disconnect] leaves it gracefully and
 * [shutdown] tears the room down completely (called on logout).
 */
@Singleton
class LiveKitCallManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val logger: AppLogger,
    private val restApi: SupabaseRestApi,
) {

    private val connectMutex = Mutex()

    /**
     * Room events and the duration ticker run on the main dispatcher, which is
     * where the LiveKit SDK expects room mutations to happen. `Dispatchers.Main`
     * (rather than `.immediate`) is deliberate: work launched from inside the
     * event stream is queued instead of re-entering the collector inline.
     */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    /** The active room, or `null` when no call is in progress. */
    @Volatile
    var room: Room? = null
        private set

    /** Human-readable description of the most recent failure, if any. */
    var lastError: String? = null
        private set

    private var eventJob: Job? = null
    private var timerJob: Job? = null
    private var peerLeftJob: Job? = null
    private var localDisconnectRequested = false

    @Volatile
    private var sdkInitialized = false

    private val _connection = MutableStateFlow(CallConnection.IDLE)
    val connection: StateFlow<CallConnection> = _connection.asStateFlow()

    private val _durationSeconds = MutableStateFlow(0L)
    val durationSeconds: StateFlow<Long> = _durationSeconds.asStateFlow()

    private val _peers = MutableStateFlow<List<CallPeer>>(emptyList())
    val peers: StateFlow<List<CallPeer>> = _peers.asStateFlow()

    private val _isMicrophoneEnabled = MutableStateFlow(true)
    val isMicrophoneEnabled: StateFlow<Boolean> = _isMicrophoneEnabled.asStateFlow()

    private val _isCameraEnabled = MutableStateFlow(false)
    val isCameraEnabled: StateFlow<Boolean> = _isCameraEnabled.asStateFlow()

    private val _isSpeakerOn = MutableStateFlow(false)
    val isSpeakerOn: StateFlow<Boolean> = _isSpeakerOn.asStateFlow()

    private val _callEnded = MutableSharedFlow<CallEndedInfo>(extraBufferCapacity = 8)
    val callEnded: SharedFlow<CallEndedInfo> = _callEnded.asSharedFlow()

    /** True while a room object exists and is not in a terminal state. */
    fun isActive(): Boolean {
        val state = room?.state ?: return false
        return state == Room.State.CONNECTED ||
            state == Room.State.CONNECTING ||
            state == Room.State.RECONNECTING
    }

    /**
     * Loads the LiveKit native libraries exactly once. Safe to call from any
     * thread; guarded by [sdkInitialized].
     */
    fun ensureInitialized() {
        if (sdkInitialized) return
        synchronized(this) {
            if (sdkInitialized) return
            try {
                LiveKit.init(context)
                LiveKit.setLoggingLevel(if (BuildConfig.DEBUG) LoggingLevel.DEBUG else LoggingLevel.WARN)
                sdkInitialized = true
                logger.i(TAG, "LiveKit SDK initialised")
            } catch (t: Throwable) {
                logger.e(TAG, "LiveKit SDK initialisation failed", t)
            }
        }
    }

    /**
     * Joins the LiveKit room for [callId] as [userId].
     *
     * Fetches a server-minted access token, creates a fresh [Room], wires the
     * event stream, connects, then publishes the microphone (always) and the
     * camera (video calls only). Returns `true` once the room is live.
     */
    suspend fun connect(
        callId: String,
        userId: String,
        userName: String,
        isVideo: Boolean,
    ): Boolean = connectMutex.withLock {
        val safeId = sanitizeUserId(userId)
        if (safeId.isEmpty() || callId.isBlank()) {
            lastError = "This call could not be started."
            _connection.value = CallConnection.FAILED
            return@withLock false
        }

        ensureInitialized()

        // Never stack two rooms: tear down anything left over from a previous call.
        teardownRoom()

        lastError = null
        localDisconnectRequested = false
        _durationSeconds.value = 0L
        _peers.value = emptyList()
        _connection.value = CallConnection.CONNECTING

        // The room name is derived from the durable call id using the same
        // `call_<id>` convention the backend enforces when it authorises a token
        // request, so both parties are guaranteed to land in one room.
        val roomName = roomNameFor(callId)

        val token = try {
            restApi.getLiveKitToken(room = roomName, userId = safeId, userName = userName)
        } catch (c: CancellationException) {
            throw c
        } catch (t: Throwable) {
            logger.e(TAG, "LiveKit token request failed", t)
            lastError = "Could not authorise the call. Please try again."
            _connection.value = CallConnection.FAILED
            return@withLock false
        }

        if (token.token.isBlank() || token.url.isBlank()) {
            lastError = "The call server returned an invalid session."
            _connection.value = CallConnection.FAILED
            return@withLock false
        }

        val newRoom = try {
            LiveKit.create(context, RoomOptions(), LiveKitOverrides())
        } catch (t: Throwable) {
            logger.e(TAG, "LiveKit.create failed", t)
            lastError = "Calling is unavailable on this device."
            _connection.value = CallConnection.FAILED
            return@withLock false
        }

        room = newRoom
        observeRoom(newRoom)

        try {
            newRoom.connect(token.url, token.token)
        } catch (c: CancellationException) {
            teardownRoom()
            throw c
        } catch (t: Throwable) {
            logger.e(TAG, "LiveKit room connect failed", t)
            lastError = "Could not reach the call server."
            _connection.value = CallConnection.FAILED
            teardownRoom()
            return@withLock false
        }

        // The Connected event may already have flipped this, but be defensive:
        // connect() only returns once the room is joined. The talk timer is NOT
        // started here: joining the SFU is not an answered call, so the duration
        // only starts once a remote participant actually shows up (see
        // [refreshPeers]). Otherwise ring time would be billed as talk time.
        _connection.value = CallConnection.CONNECTED

        publishInitialTracks(newRoom, isVideo)
        refreshPeers()
        true
    }

    /**
     * Publishes the initial media set. Microphone is always on; the camera is
     * only enabled for video calls. Failures are non-fatal: an audio-only
     * fallback is far better than dropping the call.
     */
    private suspend fun publishInitialTracks(room: Room, isVideo: Boolean) {
        val local = room.localParticipant
        try {
            local.setMicrophoneEnabled(true)
            _isMicrophoneEnabled.value = true
        } catch (c: CancellationException) {
            throw c
        } catch (t: Throwable) {
            logger.e(TAG, "Failed to publish microphone", t)
            _isMicrophoneEnabled.value = false
        }

        if (isVideo) {
            try {
                local.setCameraEnabled(true)
                _isCameraEnabled.value = true
            } catch (c: CancellationException) {
                throw c
            } catch (t: Throwable) {
                logger.e(TAG, "Failed to publish camera", t)
                _isCameraEnabled.value = false
                lastError = "Camera unavailable — continuing with audio only."
            }
        } else {
            _isCameraEnabled.value = false
        }

        // Route audio to the loudspeaker for video calls, earpiece for audio
        // calls — matching the behaviour users expect from a phone dialler.
        setSpeakerOn(isVideo)
    }

    /**
     * Leaves the room gracefully. Safe to call when no call is active. Emits
     * [callEnded] so the UI can persist the final status.
     */
    fun disconnect() {
        val current = room ?: return
        localDisconnectRequested = true
        stopTimer()
        try {
            current.disconnect()
        } catch (t: Throwable) {
            logger.w(TAG, "Room disconnect threw", t)
        }
        _connection.value = CallConnection.DISCONNECTED
        _callEnded.tryEmit(
            CallEndedInfo(
                reason = "local_hangup",
                error = null,
                initiatedLocally = true,
            ),
        )
        teardownRoom()
    }

    /**
     * Full teardown used on logout / process-wide reset. Cancels the event and
     * timer jobs, releases the room and clears all observable state.
     */
    fun shutdown() {
        teardownRoom()
        _connection.value = CallConnection.IDLE
        _durationSeconds.value = 0L
        _peers.value = emptyList()
        _isCameraEnabled.value = false
        _isMicrophoneEnabled.value = true
        _isSpeakerOn.value = false
    }

    /** Enables/disables the outgoing microphone track. */
    suspend fun setMicrophoneEnabled(enabled: Boolean): Boolean {
        val local = room?.localParticipant ?: return false
        return try {
            local.setMicrophoneEnabled(enabled)
            _isMicrophoneEnabled.value = enabled
            true
        } catch (c: CancellationException) {
            throw c
        } catch (t: Throwable) {
            logger.e(TAG, "Failed to toggle microphone", t)
            false
        }
    }

    /** Enables/disables the outgoing camera track. */
    suspend fun setCameraEnabled(enabled: Boolean): Boolean {
        val local = room?.localParticipant ?: return false
        return try {
            local.setCameraEnabled(enabled)
            _isCameraEnabled.value = enabled
            true
        } catch (c: CancellationException) {
            throw c
        } catch (t: Throwable) {
            logger.e(TAG, "Failed to toggle camera", t)
            false
        }
    }

    /** Flips between the front and back camera (no-op on audio-only calls). */
    fun switchCamera() {
        val track = localVideoTrack() ?: return
        try {
            track.switchCamera(null, CameraPosition.BACK)
        } catch (t: Throwable) {
            logger.w(TAG, "Camera switch failed", t)
        }
    }

    /**
     * Routes call audio to the loudspeaker ([enabled] = true) or the earpiece
     * ([enabled] = false) through LiveKit's audioswitch-backed handler.
     */
    fun setSpeakerOn(enabled: Boolean) {
        _isSpeakerOn.value = enabled
        val handler = room?.audioSwitchHandler ?: return
        try {
            val wanted: AudioDevice =
                if (enabled) AudioDevice.Speakerphone() else AudioDevice.Earpiece()
            val available = handler.availableAudioDevices
            val match = available.firstOrNull { it::class == wanted::class } ?: wanted
            handler.selectDevice(match)
        } catch (t: Throwable) {
            logger.w(TAG, "Audio routing change failed", t)
        }
    }

    // ---- Video rendering ---------------------------------------------------

    /**
     * Binds the local camera preview to [renderer]. Safe to call before the
     * camera track exists — the caller re-attaches on `TrackPublished`.
     */
    fun attachLocalVideo(renderer: SurfaceViewRenderer) {
        val track = localVideoTrack() ?: return
        try {
            track.addRenderer(renderer)
        } catch (t: Throwable) {
            logger.w(TAG, "attachLocalVideo failed", t)
        }
    }

    /** Binds the remote participant's camera track to [renderer]. */
    fun attachRemoteVideo(renderer: SurfaceViewRenderer, identity: String) {
        val track = remoteVideoTrack(identity) ?: return
        try {
            track.addRenderer(renderer)
        } catch (t: Throwable) {
            logger.w(TAG, "attachRemoteVideo failed", t)
        }
    }

    /** Detaches [renderer] from whichever tracks currently feed it. */
    fun detachRenderer(renderer: SurfaceViewRenderer) {
        try {
            localVideoTrack()?.removeRenderer(renderer)
        } catch (t: Throwable) {
            logger.w(TAG, "detachRenderer(local) failed", t)
        }
        try {
            remoteVideoTrack(firstPeerIdentity())?.removeRenderer(renderer)
        } catch (t: Throwable) {
            logger.w(TAG, "detachRenderer(remote) failed", t)
        }
    }

    /** The local camera track, if the camera is currently published. */
    fun localVideoTrack(): LocalVideoTrack? =
        room?.localParticipant
            ?.getTrackPublication(Track.Source.CAMERA)
            ?.track as? LocalVideoTrack

    /** The camera track published by [identity], if subscribed. */
    fun remoteVideoTrack(identity: String?): VideoTrack? {
        if (identity.isNullOrEmpty()) return null
        val participant = remoteParticipant(identity) ?: return null
        return participant.getTrackPublication(Track.Source.CAMERA)?.track as? VideoTrack
    }

    /** Identity of the first remote participant, used for 1:1 rendering. */
    fun firstPeerIdentity(): String? = _peers.value.firstOrNull()?.identity

    /** True when at least one remote participant has joined the room. */
    fun hasRemotePeer(): Boolean = _peers.value.isNotEmpty()

    private fun remoteParticipant(identity: String): RemoteParticipant? =
        room?.remoteParticipants?.values?.firstOrNull { it.identity?.value == identity }

    // ---- Internals ---------------------------------------------------------

    /**
     * Subscribes to the room's event stream. Every event that can change what
     * the call surface shows funnels into [refreshPeers]; terminal events flip
     * the connection state and emit [callEnded].
     */
    private fun observeRoom(room: Room) {
        eventJob?.cancel()
        eventJob = scope.launch {
            try {
                room.events.collect { event ->
                    when (event) {
                        is RoomEvent.Connected -> {
                            _connection.value = CallConnection.CONNECTED
                            refreshPeers()
                        }

                        is RoomEvent.Reconnected -> {
                            _connection.value = CallConnection.CONNECTED
                            refreshPeers()
                        }

                        is RoomEvent.Reconnecting -> {
                            _connection.value = CallConnection.RECONNECTING
                        }

                        is RoomEvent.Disconnected -> {
                            stopTimer()
                            _connection.value = CallConnection.DISCONNECTED
                            if (!localDisconnectRequested) {
                                _callEnded.tryEmit(
                                    CallEndedInfo(
                                        reason = event.reason?.name,
                                        error = event.error?.message,
                                        initiatedLocally = false,
                                    ),
                                )
                            }
                            // Deferred so we never cancel the collector from
                            // inside its own emit callback.
                            scope.launch { teardownRoom() }
                        }

                        is RoomEvent.FailedToConnect -> {
                            stopTimer()
                            val message = event.error.message ?: "Call failed to connect."
                            lastError = message
                            _connection.value = CallConnection.FAILED
                            _callEnded.tryEmit(
                                CallEndedInfo(
                                    reason = "failed",
                                    error = message,
                                    initiatedLocally = false,
                                ),
                            )
                            scope.launch { teardownRoom() }
                        }

                        is RoomEvent.ParticipantConnected,
                        is RoomEvent.ParticipantDisconnected,
                        is RoomEvent.ParticipantNameChanged,
                        is RoomEvent.ParticipantStateChanged,
                        is RoomEvent.TrackSubscribed,
                        is RoomEvent.TrackUnsubscribed,
                        is RoomEvent.TrackPublished,
                        is RoomEvent.TrackUnpublished,
                        is RoomEvent.TrackMuted,
                        is RoomEvent.TrackUnmuted,
                        is RoomEvent.ActiveSpeakersChanged,
                        is RoomEvent.ConnectionQualityChanged,
                        -> refreshPeers()

                        else -> Unit
                    }
                }
            } catch (c: CancellationException) {
                throw c
            } catch (t: Throwable) {
                logger.e(TAG, "Room event stream failed", t)
            }
        }
    }

    /**
     * Projects the live SDK participant objects into immutable [CallPeer]s.
     *
     * This is also where the 1:1 call semantics live: the talk timer starts when
     * the first remote participant joins, and the call is considered over when
     * the last one leaves. LiveKit keeps *our* room open in that case, so without
     * this the caller would sit in an empty room until they hung up manually.
     */
    private fun refreshPeers() {
        val current = room
        if (current == null) {
            _peers.value = emptyList()
            return
        }
        val activeSpeakers = current.activeSpeakers.mapNotNull { it.identity?.value }.toSet()
        val peers = current.remoteParticipants.values.map { participant ->
            val peerIdentity = participant.identity?.value
            participant.toCallPeer(isSpeaking = peerIdentity != null && peerIdentity in activeSpeakers)
        }
        val hadPeer = _peers.value.isNotEmpty()
        _peers.value = peers

        if (peers.isNotEmpty()) {
            peerLeftJob?.cancel()
            peerLeftJob = null
            startTimer()
        } else if (hadPeer && !localDisconnectRequested) {
            schedulePeerLeftCheck()
        }
    }

    /**
     * Ends the call once the remote party has been gone for [PEER_LEFT_GRACE_MS].
     * The grace period absorbs the transient `ParticipantDisconnected` that a
     * brief network blip produces, so a hiccup does not drop the call.
     */
    private fun schedulePeerLeftCheck() {
        if (peerLeftJob?.isActive == true) return
        peerLeftJob = scope.launch {
            delay(PEER_LEFT_GRACE_MS)
            if (_peers.value.isEmpty() && !localDisconnectRequested && room != null) {
                stopTimer()
                _connection.value = CallConnection.DISCONNECTED
                _callEnded.tryEmit(
                    CallEndedInfo(
                        reason = "peer_left",
                        error = null,
                        initiatedLocally = false,
                    ),
                )
                teardownRoom()
            }
        }
    }

    private fun Participant.toCallPeer(isSpeaking: Boolean): CallPeer {
        val identityValue = identity?.value ?: sid.value
        return CallPeer(
            identity = identityValue,
            name = name?.takeIf { it.isNotBlank() } ?: identityValue,
            isSpeaking = isSpeaking || this.isSpeaking,
            isCameraEnabled = isCameraEnabled,
            isMicrophoneEnabled = isMicrophoneEnabled,
            connectionQuality = connectionQuality,
        )
    }

    private fun startTimer() {
        if (timerJob?.isActive == true) return
        timerJob = scope.launch {
            val startedAt = SystemClock.elapsedRealtime()
            while (isActive) {
                _durationSeconds.value = (SystemClock.elapsedRealtime() - startedAt) / 1_000L
                delay(1_000L)
            }
        }
    }

    private fun stopTimer() {
        timerJob?.cancel()
        timerJob = null
    }

    /**
     * Releases the room and its resources. Idempotent: safe to call from the
     * disconnect path, the event stream and the logout path in any order.
     */
    private fun teardownRoom() {
        eventJob?.cancel()
        eventJob = null
        peerLeftJob?.cancel()
        peerLeftJob = null
        stopTimer()

        val current = room
        room = null
        if (current != null) {
            try {
                current.disconnect()
            } catch (t: Throwable) {
                logger.w(TAG, "Room disconnect during teardown threw", t)
            }
            try {
                current.release()
            } catch (t: Throwable) {
                logger.w(TAG, "Room release threw", t)
            }
        }
        _peers.value = emptyList()
        _isSpeakerOn.value = false
    }

    /**
     * LiveKit identities must be stable, opaque strings. Supabase user ids are
     * UUIDs, but we still strip anything the SDK would reject so a malformed id
     * can never take the call down.
     */
    fun sanitizeUserId(raw: String): String =
        raw.filter { it.isLetterOrDigit() || it == '_' || it == '-' }.take(64)

    /**
     * Maps a durable call id to its LiveKit room name. The `call_` prefix is part
     * of the backend contract: the `livekit-token` Edge Function strips it to
     * recover the call id and then proves the requester is a participant of that
     * call before minting anything.
     */
    fun roomNameFor(callId: String): String {
        val trimmed = callId.trim()
        if (trimmed.startsWith(ROOM_PREFIX)) return trimmed
        return "$ROOM_PREFIX${trimmed.filter { it.isLetterOrDigit() || it == '_' || it == '-' }.take(58)}"
    }

    companion object {
        private const val TAG = "LiveKitCallManager"
        const val ROOM_PREFIX = "call_"

        /**
         * How long the remote party may be absent before the call is treated as
         * finished. Long enough to ride out a transient reconnect, short enough
         * that the remaining side is not left staring at a frozen tile.
         */
        private const val PEER_LEFT_GRACE_MS = 3_000L
    }
}
