package app.gagachat.mobile.firebase

import android.app.PendingIntent
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.gagachat.mobile.R
import app.gagachat.mobile.realtime.GaGaService
import app.gagachat.mobile.ui.MainActivity
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import app.gagachat.mobile.prefs.SessionStore
import app.gagachat.mobile.prefs.AppPrefs
import app.gagachat.mobile.realtime.CallNotifications
import app.gagachat.mobile.realtime.CallBus
import app.gagachat.mobile.realtime.CurrentChat
import app.gagachat.mobile.realtime.NotifManagerCompat
import app.gagachat.mobile.ui.ChatActivity
import org.json.JSONObject

class GaGaFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) = PushTokenRegistrar.register(token)

    override fun onMessageReceived(message: RemoteMessage) {
        if (!SessionStore.isLoggedIn()) return
        val me = runCatching { JSONObject(SessionStore.me ?: "{}").optString("id") }.getOrDefault("")
        val recipient = message.data["recipient_id"]
        if (recipient != null && recipient != me) return
        if (message.data["type"] == "call") {
            val data = JSONObject(message.data as Map<*, *>)
            CallBus.emit("call", JSONObject().put("type", "call").put("data", data))
            CallNotifications.handle(this, data)
            return
        }
        if (message.data["sender_id"] == me) return
        val chatId = message.data["chat_id"]
        if (chatId != null && CurrentChat.id == chatId && AppPrefs.isAppInForeground()) return
        val title = message.notification?.title ?: message.data["title"] ?: getString(R.string.app_name)
        val body = message.notification?.body ?: message.data["body"] ?: return
        val target = if (chatId.isNullOrBlank()) Intent(this, MainActivity::class.java) else
            Intent(this, ChatActivity::class.java).putExtra("chat_id", chatId).putExtra("title", title)
        val openApp = PendingIntent.getActivity(
            this, chatId?.hashCode() ?: 0, target.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, GaGaService.CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_gaga)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openApp)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        ) {
            val id = chatId?.hashCode() ?: message.messageId?.hashCode() ?: body.hashCode()
            if (chatId != null) NotifManagerCompat.registerChat(chatId, id)
            NotificationManagerCompat.from(this).notify(id, notification)
        }
    }
}
