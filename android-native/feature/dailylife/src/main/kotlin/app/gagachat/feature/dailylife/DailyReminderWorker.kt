package app.gagachat.feature.dailylife

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.gagachat.core.network.rest.DailyLifeApi
import app.gagachat.core.network.session.SessionStore
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.CancellationException
import java.time.Instant

@HiltWorker
class DailyReminderWorker @AssistedInject constructor(
    @Assisted private val context: Context,
    @Assisted params: WorkerParameters,
    private val api: DailyLifeApi,
    private val session: SessionStore,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val owner = inputData.getString("owner") ?: return Result.failure()
        if (session.userId() != owner) return Result.success()
        val id = inputData.getString("record") ?: return Result.failure()
        try {
            val record = api.record(id) ?: return Result.success()
            if (record.completed || record.kind !in listOf("task", "reminder")) return Result.success()
            val due = record.dueAt ?: return Result.success()
            if (Instant.parse(due).isAfter(Instant.now())) return Result.success()
            val prefs = context.getSharedPreferences("daily_reminder_delivery", Context.MODE_PRIVATE)
            val deliveryKey = "$owner-$id"
            if (prefs.getString(deliveryKey, null) == due) return Result.success()
            if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return Result.success()
            val manager = context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel("daily_reminders", "GaGa Today reminders", NotificationManager.IMPORTANCE_DEFAULT))
            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return Result.success()
            val pending = PendingIntent.getActivity(context, id.hashCode(), intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val notification = NotificationCompat.Builder(context, "daily_reminders")
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(if (record.kind == "task") "GaGa task due" else "GaGa reminder")
                // Private title stays out of the lock-screen notification preview.
                .setContentText("You have an item due. Open GaGa Today to review it.")
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setContentIntent(pending).setAutoCancel(true).build()
            manager.notify(id.hashCode(), notification)
            prefs.edit().putString(deliveryKey, due).apply()
            return Result.success()
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) { return if (runAttemptCount < 3) Result.retry() else Result.failure() }
    }
}
