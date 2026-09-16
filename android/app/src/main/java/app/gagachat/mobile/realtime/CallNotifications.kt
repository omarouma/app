package app.gagachat.mobile.realtime

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import app.gagachat.mobile.R
import app.gagachat.mobile.ui.IncomingCallActivity
import org.json.JSONObject

/** Shared by WebSocket and data-only FCM; same tag prevents duplicate rings. */
object CallNotifications {
    private const val ID = 9001

    fun cancel(ctx: Context, callId: String) {
        if (callId.isBlank()) return
        val prefs = ctx.getSharedPreferences("call_notifications", Context.MODE_PRIVATE)
        val edit = prefs.edit()
        prefs.all.forEach { (key, value) ->
            if (value !is Long || System.currentTimeMillis() - value > 300_000) edit.remove(key)
        }
        edit.putLong(callId, System.currentTimeMillis()).apply()
        (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel("call:$callId", ID)
    }

    fun handle(ctx: Context, data: JSONObject) {
        val id = data.optString("call_id")
        if (id.isBlank()) return
        if (data.optString("action") == "cancel") { cancel(ctx, id); return }
        if (data.optString("action") != "ring") return
        val cancelled = ctx.getSharedPreferences("call_notifications", Context.MODE_PRIVATE).getLong(id, 0)
        if (cancelled > 0 && System.currentTimeMillis() - cancelled < 300_000) return
        val expires = data.optLong("expires_at", System.currentTimeMillis() + 30_000)
        if (expires <= System.currentTimeMillis()) return
        val video = data.optString("video") in setOf("true", "1")
        val name = data.optString("peer_name").ifBlank { ctx.getString(R.string.app_name) }
        val intent = Intent(ctx, IncomingCallActivity::class.java)
            .putExtra("call_id", id).putExtra("peer_name", name)
            .putExtra("peer_avatar", data.optString("peer_avatar"))
            .putExtra("peer_id", data.optString("peer_id")).putExtra("video", video)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val pi = PendingIntent.getActivity(ctx, id.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = NotificationCompat.Builder(ctx, GaGaService.CHANNEL_CALLS)
            .setSmallIcon(R.drawable.ic_stat_gaga).setContentTitle(name)
            .setContentText(ctx.getString(if (video) R.string.incoming_video_call else R.string.incoming_call_title))
            .setCategory(NotificationCompat.CATEGORY_CALL).setPriority(NotificationCompat.PRIORITY_MAX)
            .setOnlyAlertOnce(true).setOngoing(true).setContentIntent(pi)
            .setTimeoutAfter((expires - System.currentTimeMillis()).coerceIn(1, 45_000))
        val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT < 34 || manager.canUseFullScreenIntent()) builder.setFullScreenIntent(pi, true)
        if (manager.areNotificationsEnabled()) manager.notify("call:$id", ID, builder.build())
    }
}
