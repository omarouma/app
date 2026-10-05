package app.gagachat.push

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeout

/** Keeps call admission network work outside FCM's short process-lifetime window. */
@HiltWorker
class ValidatedCallPushWorker @AssistedInject constructor(
    @Assisted context: Context, @Assisted parameters: WorkerParameters,
    private val handler: PushHandler,
) : CoroutineWorker(context, parameters) {
    override suspend fun getForegroundInfo(): androidx.work.ForegroundInfo {
        val channel = "gaga_call_setup"
        val manager = applicationContext.getSystemService(android.app.NotificationManager::class.java)
        if (android.os.Build.VERSION.SDK_INT >= 26) manager?.createNotificationChannel(android.app.NotificationChannel(channel, "Call connection", android.app.NotificationManager.IMPORTANCE_LOW).apply { setSound(null, null) })
        val notification = androidx.core.app.NotificationCompat.Builder(applicationContext, channel)
            .setSmallIcon(app.gagachat.R.drawable.ic_notification).setContentTitle("GaGa Chat")
            .setSilent(true).setOngoing(true).setVisibility(androidx.core.app.NotificationCompat.VISIBILITY_PRIVATE).build()
        return androidx.work.ForegroundInfo(90821, notification)
    }
    override suspend fun doWork(): Result {
        val received = inputData.getLong("received_at", 0L)
        if (System.currentTimeMillis() - received > 45_000L) return Result.success()
        val data = inputData.keyValueMap.filterKeys { it != "received_at" }.mapNotNull { (key, value) -> (value as? String)?.let { key to it } }.toMap()
        return try { withTimeout(12_000L) { handler.handle(data) }; Result.success() }
        catch (e: Exception) { if (e is CancellationException && e !is kotlinx.coroutines.TimeoutCancellationException) throw e; if (runAttemptCount < 2) Result.retry() else Result.failure() }
    }
}
