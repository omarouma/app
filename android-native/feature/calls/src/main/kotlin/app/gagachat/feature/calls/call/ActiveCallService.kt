package app.gagachat.feature.calls.call

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Started only from an accepted/outgoing call with runtime permissions granted. */
@AndroidEntryPoint
class ActiveCallService : Service() {
    @Inject lateinit var calls: LiveKitCallManager
    private val actions = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var isVideoCall = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_END) {
            calls.disconnect()
            stopSelf()
            return START_NOT_STICKY
        }
        if (intent?.action == ACTION_TOGGLE_MUTE) {
            // Our foreground service is not exported. Only the PendingIntent
            // issued by GaGa may toggle the active call microphone.
            actions.launch {
                if (calls.setMicrophoneEnabled(!calls.isMicrophoneEnabled.value)) {
                    val manager = getSystemService(NotificationManager::class.java)
                    runCatching { manager?.notify(NOTIFICATION_ID, buildCallNotification()) }
                }
            }
            return START_NOT_STICKY
        }

        isVideoCall = intent?.getBooleanExtra(EXTRA_VIDEO, false) == true
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Active calls", NotificationManager.IMPORTANCE_LOW).apply {
                setSound(null, null)
                enableVibration(false)
            },
        )
        val notification = buildCallNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var types = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0
            if (isVideoCall && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            }
            startForeground(NOTIFICATION_ID, notification, types)
        } else startForeground(NOTIFICATION_ID, notification)
        return START_NOT_STICKY
    }

    private fun buildCallNotification(): Notification {
        val end = PendingIntent.getService(
            this, 1, Intent(this, ActiveCallService::class.java).setAction(ACTION_END),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val mute = PendingIntent.getService(
            this, 3, Intent(this, ActiveCallService::class.java).setAction(ACTION_TOGGLE_MUTE),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val microphoneEnabled = calls.isMicrophoneEnabled.value
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setContentTitle("GaGa call")
            .setContentText(if (microphoneEnabled) "Call in progress" else "Call in progress • microphone muted")
            .setOngoing(true).setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .addAction(android.R.drawable.ic_btn_speak_now, if (microphoneEnabled) "Mute" else "Unmute", mute)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "End call", end)
            .apply {
                if (launch != null) setContentIntent(
                    PendingIntent.getActivity(
                        this@ActiveCallService, 2, launch,
                        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                    ),
                )
            }
            .build()
    }

    override fun onDestroy() {
        actions.cancel()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_VIDEO = "video"
        private const val ACTION_END = "app.gagachat.END_ACTIVE_CALL"
        private const val ACTION_TOGGLE_MUTE = "app.gagachat.TOGGLE_CALL_MICROPHONE"
        private const val CHANNEL = "gaga_active_call"
        private const val NOTIFICATION_ID = 90032
    }
}
