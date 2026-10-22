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
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** Started only from an accepted/outgoing call with runtime permissions granted. */
@AndroidEntryPoint
class ActiveCallService : Service() {
    @Inject lateinit var calls: LiveKitCallManager

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var isVideoCall = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_END -> {
                calls.disconnect()
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_TOGGLE_MUTE -> {
                // GaGa Notifications V3: the ongoing-call notification offers a
                // verified Mute/Unmute control, mirroring the in-call UI.
                scope.launch {
                    val currentlyEnabled = calls.isMicrophoneEnabled.value
                    calls.setMicrophoneEnabled(!currentlyEnabled)
                    // Re-read the live state: the LiveKit toggle can fail, and the
                    // notification must never claim a mute that did not happen.
                    getSystemService(NotificationManager::class.java)
                        .notify(FOREGROUND_ID, buildNotification(muted = !calls.isMicrophoneEnabled.value))
                }
                return START_NOT_STICKY
            }
        }
        if (intent?.getBooleanExtra(EXTRA_VIDEO, false) == true) isVideoCall = true
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Active calls", NotificationManager.IMPORTANCE_LOW).apply {
                setSound(null, null)
                enableVibration(false)
            },
        )
        val notification = buildNotification(muted = !calls.isMicrophoneEnabled.value)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var types = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0
            if (isVideoCall && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            }
            startForeground(FOREGROUND_ID, notification, types)
        } else {
            startForeground(FOREGROUND_ID, notification)
        }
        return START_NOT_STICKY
    }

    private fun buildNotification(muted: Boolean): Notification {
        val end = PendingIntent.getService(
            this,
            1,
            Intent(this, ActiveCallService::class.java).setAction(ACTION_END),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val mute = PendingIntent.getService(
            this,
            3,
            Intent(this, ActiveCallService::class.java).setAction(ACTION_TOGGLE_MUTE),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setContentTitle("GaGa call")
            .setContentText(if (muted) "Call in progress · Muted" else "Call in progress")
            .setOngoing(true).setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .addAction(
                if (muted) android.R.drawable.ic_lock_silent_mode_off else android.R.drawable.ic_lock_silent_mode,
                if (muted) "Unmute" else "Mute",
                mute,
            )
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "End call", end)
            .apply {
                if (launch != null) {
                    setContentIntent(
                        PendingIntent.getActivity(
                            this@ActiveCallService,
                            2,
                            launch,
                            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                        ),
                    )
                }
            }
            .build()
    }

    companion object {
        const val EXTRA_VIDEO = "video"
        private const val ACTION_END = "app.gagachat.END_ACTIVE_CALL"
        private const val ACTION_TOGGLE_MUTE = "app.gagachat.TOGGLE_ACTIVE_CALL_MUTE"
        private const val CHANNEL = "gaga_active_call"
        private const val FOREGROUND_ID = 90032
    }
}
