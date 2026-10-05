package app.gagachat.feature.calls.call

import android.Manifest
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

/** Started only from an accepted/outgoing call with runtime permissions granted. */
@AndroidEntryPoint
class ActiveCallService : Service() {
    @Inject lateinit var calls: LiveKitCallManager

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_END) {
            calls.disconnect()
            stopSelf()
            return START_NOT_STICKY
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Active calls", NotificationManager.IMPORTANCE_LOW).apply {
            setSound(null, null)
            enableVibration(false)
        })
        val end = PendingIntent.getService(this, 1, Intent(this, ActiveCallService::class.java).setAction(ACTION_END), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setContentTitle("GaGa call")
            .setContentText("Call in progress")
            .setOngoing(true).setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "End call", end)
            .apply { if (launch != null) setContentIntent(PendingIntent.getActivity(this@ActiveCallService, 2, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)) }
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var types = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0
            if (intent?.getBooleanExtra(EXTRA_VIDEO, false) == true && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            }
            startForeground(90032, notification, types)
        } else startForeground(90032, notification)
        return START_NOT_STICKY
    }

    companion object {
        const val EXTRA_VIDEO = "video"
        private const val ACTION_END = "app.gagachat.END_ACTIVE_CALL"
        private const val CHANNEL = "gaga_active_call"
    }
}
