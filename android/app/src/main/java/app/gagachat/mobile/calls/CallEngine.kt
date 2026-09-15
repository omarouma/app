package app.gagachat.mobile.calls

import android.content.Context
import android.util.Log
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack

/**
 * FIX C-03: WebRTC engine over the stream prebuilt.
 * - Unified Plan SDP semantics
 * - ephemeral TURN credentials fed in by CallActivity (M-02: nothing static in APK)
 * - signals out via [Listener.onSignal] using the FLAT ICE field contract
 *   (candidate / sdp_mid / sdp_m_line_index) that the backend call_signal relay passes through.
 */
class CallEngine private constructor(private val ctx: Context) {

    interface Listener {
        /** kind: "offer" | "answer" | "candidate"; flat fields exactly as relayed. */
        fun onSignal(kind: String, sdp: String?, candidate: String?, sdpMid: String?, sdpMLineIndex: Int)
        fun onLocalVideoTrack(track: VideoTrack)
        fun onRemoteVideoTrack(track: VideoTrack)
        fun onConnectionState(state: String)
        fun onError(message: String)
    }

    companion object {
        const val TAG = "CallEngine"

        @Volatile private var singleton: CallEngine? = null
        @Volatile private var initialized = false

        fun get(ctx: Context): CallEngine =
            singleton ?: synchronized(this) {
                singleton ?: CallEngine(ctx.applicationContext).also { singleton = it }
            }
    }

    val eglBase: EglBase by lazy { EglBase.create() }
    val eglContext: EglBase.Context get() = eglBase.eglBaseContext

    var listener: Listener? = null

    private var factory: PeerConnectionFactory? = null
    private var peer: PeerConnection? = null
    private var audioSource: AudioSource? = null
    private var audioTrack: AudioTrack? = null
    private var videoSource: VideoSource? = null
    private var videoCapturer: VideoCapturer? = null
    private var videoTrack: VideoTrack? = null
    private var surfaceHelper: SurfaceTextureHelper? = null

    @Volatile private var micEnabled = true
    @Volatile private var cameraEnabled = false
    private var pendingRemoteOffer: String? = null

    // ---------- factory & initialization ----------

    private fun ensureFactory(): PeerConnectionFactory {
        factory?.let { return it }
        synchronized(this) {
            factory?.let { return it }
            if (!initialized) {
                PeerConnectionFactory.initialize(
                    PeerConnectionFactory.InitializationOptions.builder(ctx)
                        .setEnableInternalTracer(false)
                        .createInitializationOptions()
                )
                initialized = true
            }
            val f = PeerConnectionFactory.builder()
                .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true))
                .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
                .createPeerConnectionFactory()
            factory = f
            return f
        }
    }

    // ---------- public API ----------

    /**
     * Create the peer connection with the given ICE servers
     * (from GET /calls/turn — ephemeral username/credential pairs).
     */
    fun beginCall(callId: String, video: Boolean, iceServersJson: String?) {
        if (callId.isBlank()) {
            listener?.onError("invalid_call")
            return
        }
        releasePeer()
        val f = ensureFactory()
        cameraEnabled = video

        val servers = parseIceServers(iceServersJson)
        val cfg = PeerConnection.RTCConfiguration(servers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            iceTransportsType = PeerConnection.IceTransportsType.ALL
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }
        peer = f.createPeerConnection(cfg, pcObserver) ?: run {
            listener?.onError("peer_connection_failed")
            null
        }
        addLocalTracks(video)
        if (video) videoTrack?.let { listener?.onLocalVideoTrack(it) }
    }

    /** Caller: create the offer and emit it. */
    fun makeOffer() {
        val p = peer ?: run { listener?.onError("no_peer"); return }
        p.createOffer(sdpObserver("offer"), MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", cameraEnabled.toString()))
        })
    }

    /** Callee: apply the remote offer then emit the answer. */
    fun acceptWithRemoteOffer(offerSdp: String) {
        val p = peer ?: run { listener?.onError("no_peer"); return }
        p.setRemoteDescription(sdpObserver("setRemote"), SessionDescription(SessionDescription.Type.OFFER, offerSdp))
        p.createAnswer(sdpObserver("answer"), MediaConstraints())
    }

    fun onRemoteAnswer(answerSdp: String) {
        peer?.setRemoteDescription(
            sdpObserver("setRemote"),
            SessionDescription(SessionDescription.Type.ANSWER, answerSdp)
        )
    }

    fun onRemoteCandidate(candidate: String, sdpMid: String?, sdpMLineIndex: Int) {
        val c = IceCandidate(sdpMid ?: "0", sdpMLineIndex, candidate)
        peer?.addIceCandidate(c)
    }

    fun toggleMic(): Boolean {
        micEnabled = !micEnabled
        audioTrack?.setEnabled(micEnabled)
        return micEnabled
    }

    fun enableVideo(on: Boolean) {
        cameraEnabled = on
        if (on) {
            if (videoTrack == null) addVideoTrack()
            videoTrack?.let {
                it.setEnabled(true)
                listener?.onLocalVideoTrack(it)
            }
        } else {
            videoTrack?.setEnabled(false)
        }
    }

    fun switchCamera() {
        val cap = videoCapturer as? org.webrtc.CameraVideoCapturer ?: return
        cap.switchCamera(null)
    }

    fun hangup() {
        releasePeer()
    }

    fun release() {
        releasePeer()
        eglBase.release()
        factory?.dispose()
        factory = null
        singleton = null
    }

    // ---------- internals ----------

    private fun addLocalTracks(video: Boolean) {
        val f = ensureFactory()
        // audio always
        audioSource = f.createAudioSource(MediaConstraints())
        audioTrack = f.createAudioTrack("gaga-audio0", audioSource).apply { setEnabled(true) }
        peer?.addTrack(audioTrack, listOf("gaga-stream"))
        if (video) addVideoTrack()
    }

    private fun addVideoTrack() {
        ensureFactory()
        val cap = createCapturer() ?: run {
            listener?.onError("no_camera")
            return
        }
        videoCapturer = cap
        val src = factory?.createVideoSource(cap.isScreencast) ?: return
        videoSource = src
        surfaceHelper = SurfaceTextureHelper.create("gaga-capture", eglBase.eglBaseContext)
        cap.initialize(surfaceHelper, ctx, src.capturerObserver)
        cap.startCapture(640, 480, 24)
        val track = factory?.createVideoTrack("gaga-video0", src) ?: return
        track.setEnabled(true)
        videoTrack = track
        peer?.addTrack(track, listOf("gaga-stream"))
    }

    private fun createCapturer(): VideoCapturer? = runCatching {
        val enumerator = Camera2Enumerator(ctx)
        val names = enumerator.deviceNames
        val front = names.firstOrNull { enumerator.isFrontFacing(it) }
            ?: names.firstOrNull { enumerator.isBackFacing(it) }
            ?: return null
        enumerator.createCapturer(front, null)
    }.getOrNull()

    private fun parseIceServers(json: String?): MutableList<PeerConnection.IceServer> {
        val out = mutableListOf<PeerConnection.IceServer>()
        if (json.isNullOrBlank()) return out
        runCatching {
            val arr = org.json.JSONArray(json)
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val urls = o.optString("urls").split(",").map { it.trim() }.filter { it.isNotBlank() }
                if (urls.isEmpty()) continue
                val b = PeerConnection.IceServer.builder(urls)
                val user = o.optString("username")
                val cred = o.optString("credential")
                if (user.isNotBlank()) b.setUsername(user)
                if (cred.isNotBlank()) b.setPassword(cred)
                out.add(b.createIceServer())
            }
        }
        return out
    }

    private val pcObserver = object : PeerConnection.Observer {
        override fun onIceCandidate(c: IceCandidate) {
            // FLAT fields — matches backend call_signal relay + receiving side parsing
            listener?.onSignal("candidate", null, c.sdp, c.sdpMid ?: "0", c.sdpMLineIndex)
        }
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
            listener?.onConnectionState(state.name.lowercase())
            if (state == PeerConnection.IceConnectionState.FAILED) listener?.onError("ice_failed")
        }
        override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
            listener?.onConnectionState(newState.name.lowercase())
        }
        override fun onIceConnectionReceivingChange(receiving: Boolean) {}
        override fun onSignalingChange(state: PeerConnection.SignalingState) {}
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}
        override fun onAddStream(stream: MediaStream) {}
        override fun onRemoveStream(stream: MediaStream) {}
        override fun onDataChannel(dc: org.webrtc.DataChannel) {}
        override fun onRenegotiationNeeded() {}
    }

    private fun sdpObserver(forKind: String) = object : SdpObserver {
        override fun onCreateSuccess(desc: SessionDescription) {
            val p = peer ?: return
            p.setLocalDescription(object : SdpObserver {
                override fun onCreateSuccess(d: SessionDescription?) {}
                override fun onSetSuccess() {
                    when (forKind) {
                        "offer" -> listener?.onSignal("offer", desc.description, null, null, 0)
                        "answer" -> listener?.onSignal("answer", desc.description, null, null, 0)
                    }
                }
                override fun onCreateFailure(s: String?) { listener?.onError("create_failed:$s") }
                override fun onSetFailure(s: String?) { listener?.onError("set_local_failed:$s") }
            }, desc)
        }
        override fun onSetSuccess() {}
        override fun onCreateFailure(s: String?) { listener?.onError("create_failed:$s") }
        override fun onSetFailure(s: String?) { listener?.onError("set_failed:$s") }
    }

    private fun releasePeer() {
        runCatching {
            videoCapturer?.stopCapture()
        }
        runCatching { surfaceHelper?.dispose() }
        surfaceHelper = null
        videoCapturer = null
        videoTrack = null
        videoSource = null
        audioTrack = null
        audioSource?.dispose()
        audioSource = null
        peer?.close()
        peer = null
        Log.i(TAG, "peer released")
    }
}
