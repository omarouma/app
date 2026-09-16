package app.gagachat.mobile.realtime

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import app.gagachat.mobile.GaGaApp
import app.gagachat.mobile.R
import app.gagachat.mobile.prefs.AppPrefs
import app.gagachat.mobile.ui.MainActivity
import app.gagachat.mobile.ui.IncomingCallActivity
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * C-02: single foreground service owning the WebSocket + notifications.
 * UI talks to it via GaGaService.send(context, json) / CallBus events.
 */
class GaGaService : Service() {

    companion object {
        const val TAG = "GaGaService"
        const val CHANNEL_MESSAGES = "messages"
        const val CHANNEL_CALLS = "calls"
        const val CHANNEL_SERVICE = "service"
        const val SERVICE_ID = 4200
        const val CALL_NOTIF_ID = 9001
        const val ACTION_STOP = "app.gagachat.mobile.STOP"

        @Volatile private var Instance: GaGaService? = null

        fun start(ctx: Context) {
            val i = Intent(ctx, GaGaService::class.java)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, GaGaService::class.java))
        }

        /** Fire-and-forget realtime send from any UI component. */
        fun send(ctx: Context, json: JSONObject): Boolean {
            val svc = Instance
            if (svc != null) return svc.sendRealtime(json)
            // Not running yet — start it, retry shortly
            start(ctx)
            Handler(Looper.getMainLooper()).postDelayed({
                Instance?.sendRealtime(json)
            }, 500)
            return false
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private var ws: GaGaWs? = null

    override fun onCreate() {
        super.onCreate()
        Instance = this
        Log.i(TAG, "service onCreate")
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(SERVICE_ID, buildServiceNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else startForeground(SERVICE_ID, buildServiceNotification())
        connect()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Log.i(TAG, "stop requested")
            ws?.close()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        return START_NOT_STICKY
    }

    override fun onTimeout(startId: Int, fgsType: Int) {
        ws?.close()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        Instance = null
        ws?.close()
        super.onDestroy()
        Log.i(TAG, "service destroyed")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun connect() {
        ws?.close()
        ws = GaGaWs { onEvent(it) }.also { it.connect() }
    }

    fun sendRealtime(json: JSONObject): Boolean {
        val s = ws
        if (s != null && s.send(json)) return true
        // WS not open — start fresh connect, retry once shortly
        connect()
        main.postDelayed({
            if (ws?.send(json) != true) Log.w(TAG, "realtime send dropped: ${json.optString("type")}")
        }, 500)
        return false
    }

    // ---------- event routing ----------

    private fun onEvent(j: JSONObject) {
        when (j.optString("type")) {
            "message" -> {
                val d = j.optJSONObject("data") ?: return
                CallBus.emit("main", j)
                val chatId = d.optString("chat_id")
                if (chatId.isNotBlank()) CallBus.emit("chat-$chatId", j)
                val inCurrentChat = CurrentChat.id == chatId
                if (!inCurrentChat || !AppPrefs.isAppInForeground()) {
                    showMessageNotification(d)
                } else {
                    NotifManagerCompat.cancelForChat(chatId)
                }
            }
            "typing" -> {
                val d = j.optJSONObject("data") ?: return
                CallBus.emit("chat-" + d.optString("chat_id"), j)
            }
            "receipt", "message_deleted" -> {
                val d = j.optJSONObject("data") ?: return
                CallBus.emit("chat-" + d.optString("chat_id"), j)
                CallBus.emit("main", j)
            }
            "call", "call_signal" -> {
                val d = j.optJSONObject("data") ?: return
                CallBus.emit("call", j)
                val action = d.optString("action")
                if (j.optString("type") == "call") {
                    CallNotifications.handle(this, d)
                }
            }
            "wallet" -> CallBus.emit("main", j)
            "presence" -> CallBus.emit("main", j)
            "friend_request" -> CallBus.emit("main", j)
        }
    }

    private fun buildServiceNotification(): Notification {
        val pi = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.ic_stat_gaga)
            .setContentTitle(getString(R.string.service_connected_title))
            .setContentText(getString(R.string.service_connected_text))
            .setOngoing(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun showMessageNotification(d: JSONObject) {
        if (!AppPrefs.messageNotifications(this)) return
        val chatId = d.optString("chat_id")
        val title = d.optString("sender_name", getString(R.string.app_name))
        val text = if (AppPrefs.messagePreviews(this))
            d.optString("text", "").ifBlank { getString(R.string.notif_attachment) }
            else getString(R.string.notif_hidden_preview)
        val pi = PendingIntent.getActivity(
            this, chatId.hashCode(),
            Intent(this, app.gagachat.mobile.ui.ChatActivity::class.java)
                .putExtra("chat_id", chatId)
                .putExtra("title", title),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n = NotificationCompat.Builder(this, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_gaga)
            .setContentTitle(title)
            .setContentText(text)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        NotifManagerCompat.registerChat(chatId, chatId.hashCode())
        NotifManagerCompat.notify(this, chatId.hashCode(), n)
    }

    private fun showIncomingCallNotification(d: JSONObject) {
        val callId = d.optString("call_id")
        val name = d.optString("peer_name", getString(R.string.app_name))
        val video = d.optBoolean("video")
        val pi = PendingIntent.getActivity(
            this, CALL_NOTIF_ID,
            Intent(this, IncomingCallActivity::class.java)
                .putExtra("call_id", callId)
                .putExtra("peer_name", name)
                .putExtra("peer_avatar", d.optString("peer_avatar"))
                .putExtra("peer_id", d.optString("peer_id"))
                .putExtra("video", video)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n = NotificationCompat.Builder(this, CHANNEL_CALLS)
            .setSmallIcon(R.drawable.ic_stat_gaga)
            .setContentTitle(name)
            .setContentText(
                if (video) getString(R.string.incoming_video_call)
                else getString(R.string.incoming_call_title)
            )
            .setFullScreenIntent(pi, true)   // C-04
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setContentIntent(pi)
            .build()
        NotifManagerCompat.notify(this, CALL_NOTIF_ID, n)
    }
}

/** Tiny in-process event bus keyed by string channels. */
object CallBus {
    private val main = Handler(Looper.getMainLooper())
    private val listeners = ConcurrentHashMap<String, MutableList<(JSONObject) -> Unit>>()

    fun register(channel: String, l: (JSONObject) -> Unit) {
        listeners.getOrPut(channel) { mutableListOf() }.add(l)
    }

    fun unregister(channel: String, l: (JSONObject) -> Unit) {
        listeners[channel]?.remove(l)
        if (listeners[channel]?.isEmpty() == true) listeners.remove(channel)
    }

    fun emit(channel: String, j: JSONObject) {
        main.post {
            listeners[channel]?.toList()?.forEach { runCatching { it(j) } }
        }
    }
}

/** Track which chat is on screen (suppresses notifications for it). */
object CurrentChat {
    @Volatile var id: String? = null
}

/** Notification dedupe helper. */
object NotifManagerCompat {
    private val activeByChat = ConcurrentHashMap<String, Int>()
    private val activeIds = ConcurrentHashMap<Int, Boolean>()

    fun notify(ctx: Context, id: Int, n: Notification) {
        androidx.core.app.NotificationManagerCompat.from(ctx).apply {
            if (areNotificationsEnabled()) notify(id, n)
        }
        activeIds[id] = true
    }

    fun cancel(id: Int) {
        val nm = androidx.core.app.NotificationManagerCompat.from(GaGaApp.ctx())
        nm.cancel(id)
        activeIds.remove(id)
    }

    fun cancelForChat(chatId: String) {
        val id = activeByChat[chatId] ?: return
        cancel(id)
        activeByChat.remove(chatId)
    }

    fun registerChat(chatId: String, notifId: Int) {
        activeByChat[chatId] = notifId
    }
}
