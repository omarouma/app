package app.gagachat.mobile.ui

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import app.gagachat.mobile.R
import app.gagachat.mobile.net.Api
import app.gagachat.mobile.realtime.CallBus
import app.gagachat.mobile.realtime.GaGaService
import app.gagachat.mobile.realtime.NotifManagerCompat
import app.gagachat.mobile.realtime.CallNotifications
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * FIX C-04: full-screen incoming call UI. Works over lock screen
 * (showWhenLocked/turnScreenOn), plays the default ringtone while ringing,
 * cancels cleanly when the caller hangs up or WS relays "cancel".
 */
class IncomingCallActivity : AppCompatActivity() {

    private var callId: String = ""
    private var peerId: String = ""
    private var peerName: String = ""
    private var video: Boolean = false

    private var ringtone: android.media.Ringtone? = null
    private var handled = false

    private val listener: (JSONObject) -> Unit = { j ->
        val d = j.optJSONObject("data") ?: JSONObject()
        when (j.optString("type")) {
            "call" -> {
                if (d.optString("call_id") == callId && d.optString("action") == "cancel") {
                    finishCall()
                }
            }
            "call_signal" -> {
                if (d.optString("call_id") == callId && d.optString("kind") == "decline") {
                    finishCall()
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        callId = intent.getStringExtra("call_id") ?: ""
        peerId = intent.getStringExtra("peer_id") ?: ""
        peerName = intent.getStringExtra("peer_name") ?: getString(R.string.incoming_call_title)
        video = intent.getBooleanExtra("video", false)
        if (callId.isBlank()) { finish(); return }
        GaGaService.start(this)

        if (Build.VERSION.SDK_INT >= 27) {
            (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).requestDismissKeyguard(this, null)
        }

        buildUi()
        startRingtone()
        CallBus.register("call", listener)
    }

    private fun buildUi() {
        val ctx = this
        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(Ui.dp(ctx, 32), Ui.dp(ctx, 48), Ui.dp(ctx, 32), Ui.dp(ctx, 48))
        }
        val avatar = AvatarView(ctx)
        avatar.bind(peerName, null, 96)
        val avLp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        avLp.gravity = Gravity.CENTER
        avatar.layoutParams = avLp
        root.addView(avatar)
        root.addView(Ui.space(ctx, 16))
        root.addView(Ui.text(ctx, peerName, 28f, bold = true).apply { gravity = Gravity.CENTER })
        root.addView(Ui.space(ctx, 4))
        root.addView(Ui.subtitle(ctx, if (video) getString(R.string.incoming_video_call)
        else getString(R.string.incoming_call_title)).apply { gravity = Gravity.CENTER })
        root.addView(Ui.space(ctx, 48))

        val btnRow = Ui.horizontal(ctx).apply { gravity = Gravity.CENTER }
        btnRow.addView(callBtn(ctx, getString(R.string.decline), 0xFFC62828.toInt()) { decline() })
        btnRow.addView(Ui.space(ctx, 24))
        btnRow.addView(callBtn(ctx, getString(R.string.accept), 0xFF2E7D32.toInt()) { accept() })
        root.addView(btnRow)

        setContentView(root)
    }

    private fun callBtn(ctx: Context, label: String, color: Int, onClick: () -> Unit): TextView =
        Ui.text(ctx, label, 16f, bold = true, color = 0xFFFFFFFF.toInt()).apply {
            background = Ui.pillBackground(color, 32f)
            val p = Ui.dp(ctx, 20)
            setPadding(p, Ui.dp(ctx, 14), p, Ui.dp(ctx, 14))
            setOnClickListener { onClick() }
        }

    private fun startRingtone() {
        runCatching {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ringtone = RingtoneManager.getRingtone(this, uri)?.apply {
                audioAttributes = android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
                if (Build.VERSION.SDK_INT >= 28) isLooping = true
            }
            ringtone?.play()
        }
    }

    private fun accept() {
        if (handled) return
        handled = true
        stopRingtone()
        CallNotifications.cancel(this, callId)
        // C-03: relay "accept" so the caller switches to the ringing UI;
        // CallActivity (callee side) performs the WebRTC answer.
        GaGaService.send(this, JSONObject()
            .put("type", "call_signal")
            .put("data", JSONObject()
                .put("call_id", callId)
                .put("kind", "accept")
                .put("to", peerId)))
        startActivity(Intent(this, CallActivity::class.java)
            .putExtra("call_id", callId)
            .putExtra("call_db_id", callId)
            .putExtra("peer_id", peerId)
            .putExtra("peer_name", peerName)
            .putExtra("video", video)
            .putExtra("caller", false))
        finish()
    }

    private fun decline() {
        if (handled) return
        handled = true
        stopRingtone()
        CallNotifications.cancel(this, callId)
        GaGaService.send(this, JSONObject()
            .put("type", "call_signal")
            .put("data", JSONObject()
                .put("call_id", callId)
                .put("kind", "decline")
                .put("to", peerId)))
        lifecycleScope.launch {
            runCatching { Api.post("/calls/$callId/end") }
        }
        finish()
    }

    private fun finishCall() {
        if (handled) return
        handled = true
        stopRingtone()
        CallNotifications.cancel(this, callId)
        finish()
    }

    private fun stopRingtone() {
        runCatching { ringtone?.stop() }
        ringtone = null
    }

    override fun onDestroy() {
        CallBus.unregister("call", listener)
        stopRingtone()
        super.onDestroy()
    }
}
