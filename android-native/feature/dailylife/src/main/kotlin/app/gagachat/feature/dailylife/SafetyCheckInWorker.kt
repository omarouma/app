package app.gagachat.feature.dailylife

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.gagachat.core.model.SafetyStatus
import app.gagachat.core.network.rest.SafetyApi
import app.gagachat.core.network.session.SessionStore
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.CancellationException
import java.time.Instant

/**
 * Fires at a Safe check-in's due time. If the check-in is still pending and past
 * due it is escalated (owner-only, idempotent server-side) and the owner is
 * prompted locally. No emergency action ever runs without a user-created
 * check-in.
 */
@HiltWorker
class SafetyCheckInWorker @AssistedInject constructor(
    @Assisted private val context: Context,
    @Assisted params: WorkerParameters,
    private val api: SafetyApi,
    private val session: SessionStore,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val owner = inputData.getString("owner") ?: return Result.failure()
        if (session.userId() != owner) return Result.success()
        val id = inputData.getString("checkin") ?: return Result.failure()
        try {
            val checkIn = api.checkIns().firstOrNull { it.id == id } ?: return Result.success()
            if (checkIn.safetyStatus != SafetyStatus.PENDING) return Result.success()
            if (Instant.parse(checkIn.dueAt).isAfter(Instant.now())) return Result.success()
            api.escalate(id)
            notifyOwner(id, checkIn.label)
            return Result.success()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    private fun notifyOwner(id: String, label: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel("safety_checkins", "GaGa Safe check-ins", NotificationManager.IMPORTANCE_HIGH),
        )
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
        val pending = PendingIntent.getActivity(
            context,
            id.hashCode(),
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, "safety_checkins")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("Safety check-in expired")
            // Private title keeps the label off the lock screen.
            .setContentText("Open GaGa Safe to confirm you are okay.")
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        manager.notify(id.hashCode(), notification)
    }
}
