package app.gagachat.mobile.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.media.AudioManager
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import app.gagachat.mobile.R
import app.gagachat.mobile.calls.CallEngine
import app.gagachat.mobile.net.Api
import app.gagachat.mobile.realtime.CallBus
import app.gagachat.mobile.realtime.GaGaService
import app.gagachat.mobile.realtime.NotifManagerCompat
import app.gagachat.mobile.ui.Ui.dp
import app.gagachat.mobile.ui.Ui.title
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer

/**
 * Active WebRTC call screen (audio or video). Works for caller and callee.
 * Caller: fetch TURN -> engine.beginCall -> makeOffer -> send offer.
 * Callee: entered after accepting; waits for remote offer then answers.
 */
class CallActivity : AppCompatActivity(), CallEngine.Listener {

    companion object {
        const val EXTRA_CALL_ID = "call_id"
        const val EXTRA_CALL_ID_DB = "call_db_id"
        const val EXTRA_PEER_ID = "peer_id"
        const val EXTRA_PEER_NAME = "peer_name"
        const val EXTRA_PEER_AVATAR = "peer_avatar"
        const val EXTRA_VIDEO = "video"
        const val EXTRA_CALLER = "caller"
    }

    private var callId = ""
    private var callDbId = ""
    private var peerId = ""
    private var peerName = ""
    private var peerAvatar: String? = null
    private var video = false
    private var isCaller = false

    private var engine: CallEngine? = null
    private var statusView: TextView? = null
    private var remoteRender: SurfaceViewRenderer? = null
    private var localRender: SurfaceViewRenderer? = null
    private var micEnabled = true
    private var videoEnabled = true
    private var finished = false

    private var audioManager: AudioManager? = null
    private var oldAudioMode = AudioManager.MODE_INVALID
    private var wasSpeakerphoneOn = false

    // Explicit (JSONObject) -> Unit: safe-call branch results coerce cleanly.
    private val listener: (JSONObject) -> Unit = { j ->
        val data = j.optJSONObject("data") ?: JSONObject()
        when (j.optString("type")) {
            "call_signal" -> when (data.optString("kind")) {
                "offer" -> {
                    engine?.acceptWithRemoteOffer(data.optString("sdp"))
                    setStatus(R.string.call_connecting)
                }
                "answer" -> engine?.onRemoteAnswer(data.optString("sdp"))
                "candidate" -> engine?.onRemoteCandidate(
                    data.optString("candidate"),
                    data.optString("sdp_mid").takeIf { it.isNotBlank() },
                    data.optInt("sdp_m_line_index", 0)
                )
                "accept" -> setStatus(R.string.call_connecting)
                "decline" -> endFromRemote(R.string.call_declined)
                "hangup" -> endFromRemote(R.string.call_ended)
                else -> {}
            }
            "call" -> when (data.optString("action")) {
                "cancel" -> endFromRemote(R.string.call_declined)
                "end" -> endFromRemote(R.string.call_ended)
                "timeout" -> endFromRemote(R.string.call_failed)
                else -> {}
            }
            else -> {}
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        callId = intent.getStringExtra(EXTRA_CALL_ID) ?: ""
        callDbId = intent.getStringExtra(EXTRA_CALL_ID_DB) ?: ""
        peerId = intent.getStringExtra(EXTRA_PEER_ID) ?: ""
        peerName = intent.getStringExtra(EXTRA_PEER_NAME) ?: ""
        peerAvatar = intent.getStringExtra(EXTRA_PEER_AVATAR)
        video = intent.getBooleanExtra(EXTRA_VIDEO, false)
        isCaller = intent.getBooleanExtra(EXTRA_CALLER, false)
        videoEnabled = video

        engine = CallEngine.get(this).also { it.listener = this }
        setupAudio()
        buildUi()
        CallBus.register("call", listener)
        NotifManagerCompat.cancel(9001)

        if (isCaller) startCallerFlow() else setStatus(R.string.call_connecting)
    }

    @Suppress("DEPRECATION")
    private fun setupAudio() {
        audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        audioManager?.let { am ->
            oldAudioMode = am.mode
            wasSpeakerphoneOn = am.isSpeakerphoneOn
            am.mode = AudioManager.MODE_IN_COMMUNICATION
            am.isSpeakerphoneOn = video
        }
    }

    @SuppressLint("SetTextI18n")
    private fun buildUi() {
        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.setBackgroundColor(Color.BLACK)

        // ---------- top: peer identity ----------
        val head = LinearLayout(this)
        head.orientation = LinearLayout.HORIZONTAL
        head.gravity = Gravity.CENTER_VERTICAL
        head.setPadding(dp(this, 16), dp(this, 48), dp(this, 16), dp(this, 8))
        root.addView(head, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        val avatar = AvatarView(this)
        avatar.bind(peerName.ifEmpty { "?" }, peerAvatar, 56)
        head.addView(avatar, LinearLayout.LayoutParams(dp(this, 56), dp(this, 56)))

        val nameBox = LinearLayout(this)
        nameBox.orientation = LinearLayout.VERTICAL
        nameBox.setPadding(dp(this, 12), 0, dp(this, 12), 0)
        head.addView(nameBox, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

        val nameView = title(this, peerName.ifEmpty { getString(R.string.app_name) })
        nameView.textSize = 20f
        nameView.setTextColor(Color.WHITE)
        nameBox.addView(nameView)

        statusView = TextView(this)
        statusView!!.text = getString(if (isCaller) R.string.call_ringing else R.string.call_connecting)
        statusView!!.textSize = 13f
        statusView!!.setTextColor(0xB3FFFFFF.toInt())
        nameBox.addView(statusView)

        // ---------- middle: video area or avatar ----------
        val mid = FrameLayout(this)
        if (video) {
            remoteRender = SurfaceViewRenderer(this).also { r ->
                r.init(engine!!.eglContext, null)
                r.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                r.setZOrderMediaOverlay(false)
                mid.addView(r, FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            }
            localRender = SurfaceViewRenderer(this).also { r ->
                r.init(engine!!.eglContext, null)
                r.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
                r.setMirror(true)
                r.setZOrderMediaOverlay(true)
                val lp = FrameLayout.LayoutParams(
                    dp(this, 100), dp(this, 140), Gravity.TOP or Gravity.END)
                lp.topMargin = dp(this, 12)
                lp.rightMargin = dp(this, 12)
                mid.addView(r, lp)
            }
        } else {
            val center = LinearLayout(this)
            center.orientation = LinearLayout.VERTICAL
            center.gravity = Gravity.CENTER
            val av = AvatarView(this)
            av.bind(peerName.ifEmpty { "?" }, peerAvatar, 120)
            center.addView(av, LinearLayout.LayoutParams(dp(this, 120), dp(this, 120)))
            center.setPadding(0, dp(this, 16), 0, dp(this, 16))
            mid.addView(center, FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        root.addView(mid, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        // ---------- bottom: controls ----------
        val controls = LinearLayout(this)
        controls.orientation = LinearLayout.HORIZONTAL
        controls.gravity = Gravity.CENTER
        controls.setPadding(dp(this, 16), dp(this, 16), dp(this, 16), dp(this, 40))
        root.addView(controls, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        val spacing = dp(this, 18)
        fun addCtrl(label: String, bg: Int, onClick: (View) -> Unit) {
            val b = TextView(this)
            b.text = label
            b.textSize = 22f
            b.gravity = Gravity.CENTER
            b.setTextColor(Color.WHITE)
            val d = GradientDrawable()
            d.shape = GradientDrawable.OVAL
            d.setColor(bg)
            b.background = d
            b.setOnClickListener(onClick)
            val lp = LinearLayout.LayoutParams(dp(this, 56), dp(this, 56))
            lp.rightMargin = spacing
            controls.addView(b, lp)
        }

        addCtrl("\uD83C\uDFA4", 0x66FFFFFF.toInt()) {
            micEnabled = !micEnabled
            engine?.toggleMic()
            it.alpha = if (micEnabled) 1f else 0.4f
        }
        if (video) {
            addCtrl("\uD83D\uDCF7", 0x66FFFFFF.toInt()) {
                videoEnabled = !videoEnabled
                engine?.enableVideo(videoEnabled)
                localRender?.visibility = if (videoEnabled) View.VISIBLE else View.GONE
            }
            addCtrl("\uD83D\uDD04", 0x66FFFFFF.toInt()) { engine?.switchCamera() }
        }
        addCtrl("\uD83D\uDCDE", 0xFFC62828.toInt()) { hangup(true) }

        setContentView(root)
        // keep the screen on during a call
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    private fun setStatus(res: Int) {
        runOnUiThread { statusView?.setText(res) }
    }

    // ================= caller flow =================
    private fun startCallerFlow() {
        setStatus(R.string.call_ringing)
        lifecycleScope.launch {
            try {
                // 1) TURN servers (best-effort; calls also work on host/srflx candidates)
                var iceJson: String? = null
                try {
                    val turnRes = Api.get("/calls/turn")
                    val arr = turnRes.optJSONArray("servers")
                    if (arr != null && arr.length() > 0) iceJson = arr.toString()
                } catch (_: Exception) { }

                // 2) start engine + create the offer
                engine?.beginCall(callId, video, iceJson)
                engine?.makeOffer()
            } catch (e: Exception) {
                Toast.makeText(this@CallActivity, e.message ?: "call failed", Toast.LENGTH_LONG).show()
                finish()
            }
        }
    }

    // ================= signaling =================
    private fun signal(kind: String, sdp: String? = null, candidate: String? = null,
                       sdpMid: String? = null, sdpMLineIndex: Int = 0) {
        val data = JSONObject()
            .put("call_id", callId)
            .put("kind", kind)
            .put("to", peerId)
        if (sdp != null) data.put("sdp", sdp)
        if (candidate != null) {
            data.put("candidate", candidate)
            data.put("sdp_mid", sdpMid)
            data.put("sdp_m_line_index", sdpMLineIndex)
        }
        GaGaService.send(this, JSONObject()
            .put("type", "call_signal")
            .put("data", data))
    }

    // ================= teardown =================
    private fun hangup(notifyPeer: Boolean) {
        if (finished) return
        finished = true
        if (notifyPeer) {
            signal("hangup")
            if (callDbId.isNotEmpty()) lifecycleScope.launch {
                try { Api.post("/calls/$callDbId/end", JSONObject()) } catch (_: Exception) { }
            }
        }
        engine?.hangup()
        finish()
    }

    private fun endFromRemote(statusRes: Int) {
        if (finished) return
        finished = true
        runOnUiThread {
            setStatus(statusRes)
            Toast.makeText(this, statusRes, Toast.LENGTH_SHORT).show()
        }
        engine?.hangup()
        android.os.Handler(mainLooper).postDelayed({ finish() }, 600)
    }

    // oldAudioMode is read directly from AudioManager.mode; restoring that
    // framework-provided value is safe even though lint cannot track its range.
    @SuppressLint("WrongConstant")
    @Suppress("DEPRECATION")
    override fun onDestroy() {
        super.onDestroy()
        CallBus.unregister("call", listener)
        runCatching { remoteRender?.release() }
        runCatching { localRender?.release() }
        engine?.listener = null
        audioManager?.let { am ->
            if (oldAudioMode != AudioManager.MODE_INVALID) {
                am.mode = oldAudioMode
            }
            am.isSpeakerphoneOn = wasSpeakerphoneOn
        }
        NotifManagerCompat.cancel(9001)
    }

    // ================= CallEngine.Listener =================
    override fun onSignal(kind: String, sdp: String?, candidate: String?,
                          sdpMid: String?, sdpMLineIndex: Int) {
        signal(kind, sdp, candidate, sdpMid, sdpMLineIndex)
    }

    override fun onLocalVideoTrack(track: org.webrtc.VideoTrack) {
        runOnUiThread { localRender?.let { track.addSink(it) } }
    }

    override fun onRemoteVideoTrack(track: org.webrtc.VideoTrack) {
        runOnUiThread { remoteRender?.let { track.addSink(it) } }
    }

    override fun onConnectionState(state: String) {
        runOnUiThread {
            when (state) {
                "CONNECTED" -> setStatus(R.string.call_active)
                "FAILED" -> endFromRemote(R.string.call_failed)
                "CLOSED" -> if (!finished) endFromRemote(R.string.call_ended)
                else -> {}
            }
        }
    }

    override fun onError(message: String) {
        runOnUiThread {
            Toast.makeText(this, message, Toast.LENGTH_LONG).show()
            endFromRemote(R.string.call_failed)
        }
    }
}
