package app.gagachat.feature.calls.call

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import android.os.SystemClock
import app.gagachat.core.common.BuildConfig
import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.network.rest.SupabaseRestApi
import com.twilio.audioswitch.AudioDevice
import com.twilio.audioswitch.AudioDeviceChangeListener
import dagger.hilt.android.qualifiers.ApplicationContext
import io.livekit.android.LiveKit
import io.livekit.android.LiveKitOverrides
import io.livekit.android.RoomOptions
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.renderer.SurfaceViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.network.DefaultReconnectPolicy
import io.livekit.android.room.participant.AudioPresets
import io.livekit.android.room.participant.AudioTrackPublishDefaults
import io.livekit.android.room.participant.ConnectionQuality
import io.livekit.android.room.participant.Participant
import io.livekit.android.room.participant.RemoteParticipant
import io.livekit.android.room.participant.VideoTrackPublishDefaults
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.LocalAudioTrackOptions
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.LocalVideoTrackOptions
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoPreset169
import io.livekit.android.room.track.VideoTrack
import io.livekit.android.util.LoggingLevel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
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
    val videoTrackReady: Boolean = false,
)

/** Emitted once when a call finishes, so the UI can persist the final status. */
data class CallEndedInfo(
    val reason: String?,
    val error: String?,
    val initiatedLocally: Boolean,
)

/** The physical route call audio is currently playing through. */
enum class AudioDeviceKind { SPEAKER, EARPIECE, BLUETOOTH, WIRED, OTHER }

/**
 * Immutable projection of one selectable audio output, so the call UI can offer
 * a real device picker (Bluetooth / wired / speaker / earpiece) without holding a
 * reference to the mutable SDK object.
 */
data class AudioDeviceInfo(
    val id: String,
    val label: String,
    val kind: AudioDeviceKind,
) {
    val isSpeaker: Boolean get() = kind == AudioDeviceKind.SPEAKER
    val isHeadset: Boolean get() = kind == AudioDeviceKind.BLUETOOTH || kind == AudioDeviceKind.WIRED
}

/**
 * Lightweight, live view of the media session for the in-call diagnostics panel.
 * Everything here is read straight off the SDK \u2014 no values are invented.
 */
data class CallDiagnostics(
    val roomName: String? = null,
    val isVideo: Boolean = false,
    val adaptiveStream: Boolean = false,
    val dynacast: Boolean = false,
    val peerCount: Int = 0,
    val reconnectCount: Int = 0,
    val connectionQuality: ConnectionQuality = ConnectionQuality.UNKNOWN,
    val audioDeviceLabel: String? = null,
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

    /**
     * Stable reference to the audioswitch device-change callback so it can be
     * unregistered when the room is torn down. The handler holds listeners in a
     * set, so re-registering a fresh lambda each call would leak them.
     */
    private var audioDeviceListener: AudioDeviceChangeListener? = null

    /** Monotonic count of successful LiveKit reconnects for this call. */
    private var reconnectCount = 0

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

    /** Audio outputs the user can route the call through right now. */
    private val _audioDevices = MutableStateFlow<List<AudioDeviceInfo>>(emptyList())
    val audioDevices: StateFlow<List<AudioDeviceInfo>> = _audioDevices.asStateFlow()

    /** The audio output call audio is currently playing through, if known. */
    private val _currentAudioDevice = MutableStateFlow<AudioDeviceInfo?>(null)
    val currentAudioDevice: StateFlow<AudioDeviceInfo?> = _currentAudioDevice.asStateFlow()

    /** Live media diagnostics for the in-call stats panel. */
    private val _diagnostics = MutableStateFlow(CallDiagnostics())
    val diagnostics: StateFlow<CallDiagnostics> = _diagnostics.asStateFlow()

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
                LiveKit.loggingLevel = if (BuildConfig.DEBUG) LoggingLevel.DEBUG else LoggingLevel.WARN
                sdkInitialized = true
                logger.i(TAG, "LiveKit SDK initialised")
            } catch (t: Throwable) {
                logger.e(TAG, "LiveKit SDK initialisation failed", t)
            }
        }
    }

    /**
     * Builds the LiveKit [RoomOptions] that make calls sound and look right and
     * survive flaky networks. Everything here is a real, behaviour-changing
     * setting (not a placeholder):
     *
     *  * **adaptiveStream** \u2014 the SDK only requests the video resolution the
     *    on-screen renderer actually needs, so a small PiP window stops pulling a
     *    720p stream. Less bandwidth \u2192 faster start and fewer stalls.
     *  * **dynacast** \u2014 pauses outbound simulcast layers nobody is subscribed to,
     *    cutting uplink on weak connections.
     *  * **reconnectPolicy** \u2014 the default LiveKit policy (aggressive early
     *    retries, exponential back-off to 5s, 60s ceiling) so a Wi-Fi\u2192LTE
     *    hand-off or a brief tunnel drop recovers instead of dropping the call.
     *  * **audioTrackCaptureDefaults** \u2014 echo cancellation, noise suppression,
     *    auto gain and a high-pass filter, which is what turns a laptop-style
     *    "hollow, echoing" call into a phone-quality one.
     *  * **audioTrackPublishDefaults** \u2014 [AudioPresets.SPEECH] bitrate with DTX
     *    (silence suppression) and RED (redundant audio) for clear speech that
     *    still recovers from packet loss.
     *  * **videoTrackCapture/PublishDefaults** \u2014 a 720p 16:9 capture with
     *    simulcast so the receiver can pick the layer its network can sustain.
     */
    internal fun buildRoomOptions(isVideo: Boolean): RoomOptions = RoomOptions(
        adaptiveStream = true,
        dynacast = true,
        reconnectPolicy = DefaultReconnectPolicy(),
        audioTrackCaptureDefaults = LocalAudioTrackOptions(
            noiseSuppression = true,
            echoCancellation = true,
            autoGainControl = true,
            highPassFilter = true,
            typingNoiseDetection = true,
        ),
        audioTrackPublishDefaults = AudioTrackPublishDefaults(
            audioBitrate = AudioPresets.SPEECH.maxBitrate,
            dtx = true,
            red = true,
        ),
        videoTrackCaptureDefaults = if (isVideo) {
            LocalVideoTrackOptions(
                position = CameraPosition.FRONT,
                captureParams = VideoPreset169.H720.capture,
            )
        } else {
            null
        },
        videoTrackPublishDefaults = if (isVideo) {
            VideoTrackPublishDefaults(
                videoEncoding = VideoPreset169.H720.encoding,
                simulcast = true,
            )
        } else {
            null
        },
    )

    /**
     * Recomputes the in-call diagnostics snapshot straight off the live room.
     * Called on connect, on every peer/quality change and on reconnect, so the
     * stats panel always reflects the real SDK state rather than a guess.
     */
    internal fun publishDiagnostics(room: Room, isVideo: Boolean) {
        val quality = room.remoteParticipants.values
            .firstOrNull()?.connectionQuality
            ?: ConnectionQuality.UNKNOWN
        _diagnostics.value = CallDiagnostics(
            roomName = room.name,
            isVideo = isVideo,
            adaptiveStream = room.adaptiveStream,
            dynacast = room.dynacast,
            peerCount = room.remoteParticipants.size,
            reconnectCount = reconnectCount,
            connectionQuality = quality,
            audioDeviceLabel = _currentAudioDevice.value?.label,
        )
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
            withTimeout(15_000L) { restApi.getLiveKitToken(room = roomName, userId = safeId, userName = userName) }
        } catch (timeout: TimeoutCancellationException) {
            lastError = "Call authorisation timed out. Please try again."
            _connection.value = CallConnection.FAILED
            return@withLock false
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
            LiveKit.create(context, buildRoomOptions(isVideo), LiveKitOverrides())
        } catch (t: Throwable) {
            logger.e(TAG, "LiveKit.create failed", t)
            lastError = "Calling is unavailable on this device."
            _connection.value = CallConnection.FAILED
            return@withLock false
        }

        room = newRoom
        observeRoom(newRoom)
        registerAudioDeviceListener(newRoom)
        reconnectCount = 0
        publishDiagnostics(newRoom, isVideo)

        try {
            ContextCompat.startForegroundService(context, Intent(context, ActiveCallService::class.java).putExtra(ActiveCallService.EXTRA_VIDEO, isVideo))
            withTimeout(20_000L) { newRoom.connect(token.url, token.token) }
        } catch (timeout: TimeoutCancellationException) {
            lastError = "The call server did not respond. Please try again."
            _connection.value = CallConnection.FAILED
            teardownRoom()
            return@withLock false
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

        if (!publishInitialTracks(newRoom, isVideo)) {
            _connection.value = CallConnection.FAILED
            teardownRoom()
            return@withLock false
        }
        refreshPeers()
        true
    }

    /**
     * Publishes the initial media set. Microphone is always on; the camera is
     * only enabled for video calls. Failures are non-fatal: an audio-only
     * fallback is far better than dropping the call.
     */
    internal suspend fun publishInitialTracks(room: Room, isVideo: Boolean): Boolean {
        val local = room.localParticipant
        try {
            check(withTimeout(10_000L) { local.setMicrophoneEnabled(true) }) { "Microphone publication failed" }
            _isMicrophoneEnabled.value = true
        } catch (c: CancellationException) {
            if (c !is TimeoutCancellationException) throw c
            _isMicrophoneEnabled.value = false
            lastError = "Microphone did not start in time. Please try again."
            return false
        } catch (t: Throwable) {
            logger.e(TAG, "Failed to publish microphone", t)
            _isMicrophoneEnabled.value = false
            lastError = "Microphone could not start. Check microphone permission and try again."
            return false
        }

        if (isVideo) {
            try {
                check(withTimeout(10_000L) { local.setCameraEnabled(true) }) { "Camera publication failed" }
                _isCameraEnabled.value = true
            } catch (c: CancellationException) {
                if (c !is TimeoutCancellationException) throw c
                _isCameraEnabled.value = false
                lastError = "Camera timed out — continuing with audio only."
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
        return true
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
        val current = room ?: return false
        val local = current.localParticipant
        return try {
            if (!withTimeout(10_000L) { local.setMicrophoneEnabled(enabled) }) return false
            if (room !== current) return false
            _isMicrophoneEnabled.value = enabled
            true
        } catch (timeout: TimeoutCancellationException) {
            false
        } catch (c: CancellationException) {
            throw c
        } catch (t: Throwable) {
            logger.e(TAG, "Failed to toggle microphone", t)
            false
        }
    }

    /** Enables/disables the outgoing camera track. */
    suspend fun setCameraEnabled(enabled: Boolean): Boolean {
        val current = room ?: return false
        val local = current.localParticipant
        return try {
            if (!withTimeout(10_000L) { local.setCameraEnabled(enabled) }) return false
            if (room !== current) return false
            _isCameraEnabled.value = enabled
            true
        } catch (timeout: TimeoutCancellationException) {
            false
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
            val nextPosition = when (track.options.position) {
                CameraPosition.FRONT -> CameraPosition.BACK
                CameraPosition.BACK -> CameraPosition.FRONT
                else -> null
            }
            track.switchCamera(position = nextPosition)
        } catch (t: Throwable) {
            logger.w(TAG, "Camera switch failed", t)
        }
    }

    /**
     * Routes call audio to the loudspeaker ([enabled] = true) or the earpiece
     * ([enabled] = false) through LiveKit's audioswitch-backed handler.
     */
    fun setSpeakerOn(enabled: Boolean): Boolean {
        val handler = room?.audioSwitchHandler ?: return false
        return try {
            // `AudioDevice.Speakerphone`/`Earpiece` have internal constructors in
            // audioswitch, so we select the matching *instance* from the handler's
            // live device list instead of building one ourselves.
            val available = handler.availableAudioDevices
            val match = if (enabled) {
                available.firstOrNull { it is AudioDevice.Speakerphone }
            } else {
                // Prefer a connected headset when turning the speaker off; fall
                // back to the earpiece so the control always does something.
                available.firstOrNull { it is AudioDevice.BluetoothHeadset }
                    ?: available.firstOrNull { it is AudioDevice.WiredHeadset }
                    ?: available.firstOrNull { it is AudioDevice.Earpiece }
            }
            if (match == null) return false
            handler.selectDevice(match)
            refreshAudioDevices(handler.availableAudioDevices, handler.selectedAudioDevice)
            true
        } catch (t: Throwable) {
            logger.w(TAG, "Audio routing change failed", t)
            false
        }
    }

    // ---- Audio device management ------------------------------------------

    /**
     * Subscribes to audioswitch's device list so the picker reflects hot-plugged
     * headsets and the active route in real time.
     */
    private fun registerAudioDeviceListener(room: Room) {
        val handler = room.audioSwitchHandler ?: return
        unregisterAudioDeviceListener()
        val listener: AudioDeviceChangeListener = { devices, selected ->
            if (this.room === room) refreshAudioDevices(devices, selected)
        }
        try {
            handler.registerAudioDeviceChangeListener(listener)
            audioDeviceListener = listener
            refreshAudioDevices(handler.availableAudioDevices, handler.selectedAudioDevice)
        } catch (t: Throwable) {
            logger.w(TAG, "Audio device listener registration failed", t)
        }
    }

    private fun unregisterAudioDeviceListener() {
        val listener = audioDeviceListener ?: return
        audioDeviceListener = null
        try {
            room?.audioSwitchHandler?.unregisterAudioDeviceChangeListener(listener)
        } catch (t: Throwable) {
            logger.w(TAG, "Audio device listener removal failed", t)
        }
    }

    /**
     * Routes call audio to the device with the given [id] (see [AudioDeviceInfo]).
     * Returns `true` when the SDK accepted the switch.
     */
    fun selectAudioDevice(id: String): Boolean {
        val handler = room?.audioSwitchHandler ?: return false
        return try {
            val target = handler.availableAudioDevices.firstOrNull { it.toAudioDeviceInfo().id == id }
                ?: return false
            handler.selectDevice(target)
            refreshAudioDevices(handler.availableAudioDevices, target)
            true
        } catch (t: Throwable) {
            logger.w(TAG, "Audio device selection failed", t)
            false
        }
    }

    /** Re-projects the SDK device list into the immutable UI model. */
    private fun refreshAudioDevices(devices: List<AudioDevice>, selected: AudioDevice?) {
        val infos = devices.map { it.toAudioDeviceInfo() }
        _audioDevices.value = infos
        val selectedInfo = selected?.toAudioDeviceInfo()
            ?: infos.firstOrNull { it.isSpeaker }
        _currentAudioDevice.value = selectedInfo
        _isSpeakerOn.value = selectedInfo?.isSpeaker ?: _isSpeakerOn.value
        _diagnostics.update { it.copy(audioDeviceLabel = selectedInfo?.label) }
    }

    private fun AudioDevice.toAudioDeviceInfo(): AudioDeviceInfo = when (this) {
        is AudioDevice.Speakerphone -> AudioDeviceInfo("speaker", "Speaker", AudioDeviceKind.SPEAKER)
        is AudioDevice.Earpiece -> AudioDeviceInfo("earpiece", "Phone", AudioDeviceKind.EARPIECE)
        is AudioDevice.BluetoothHeadset -> AudioDeviceInfo(
            id = "bluetooth",
            label = name.takeIf { it.isNotBlank() } ?: "Bluetooth",
            kind = AudioDeviceKind.BLUETOOTH,
        )
        is AudioDevice.WiredHeadset -> AudioDeviceInfo(
            id = "wired",
            label = name.takeIf { it.isNotBlank() } ?: "Wired headset",
            kind = AudioDeviceKind.WIRED,
        )
        else -> AudioDeviceInfo(id = name, label = name, kind = AudioDeviceKind.OTHER)
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
                    if (this@LiveKitCallManager.room !== room) return@collect
                    when (event) {
                        is RoomEvent.Connected -> {
                            _connection.value = CallConnection.CONNECTED
                            refreshPeers()
                        }

                        is RoomEvent.Reconnected -> {
                            _connection.value = CallConnection.CONNECTED
                            reconnectCount++
                            refreshPeers()
                            room.let { publishDiagnostics(it, _diagnostics.value.isVideo) }
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
                            scope.launch { if (this@LiveKitCallManager.room === room) teardownRoom() }
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
                            scope.launch { if (this@LiveKitCallManager.room === room) teardownRoom() }
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
        publishDiagnostics(current, _diagnostics.value.isVideo)

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
            videoTrackReady = getTrackPublication(Track.Source.CAMERA)?.track != null,
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
        context.stopService(Intent(context, ActiveCallService::class.java))
        eventJob?.cancel()
        eventJob = null
        peerLeftJob?.cancel()
        peerLeftJob = null
        stopTimer()
        // Unregister before dropping the room reference: the listener removal
        // needs the room's audio handler to still be reachable.
        unregisterAudioDeviceListener()

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
        reconnectCount = 0
        _peers.value = emptyList()
        _isSpeakerOn.value = false
        _audioDevices.value = emptyList()
        _currentAudioDevice.value = null
        _diagnostics.value = CallDiagnostics()
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
