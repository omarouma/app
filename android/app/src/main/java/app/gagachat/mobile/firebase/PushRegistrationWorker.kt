package app.gagachat.mobile.firebase

import android.content.Context
import android.os.Build
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.gagachat.mobile.net.Api
import app.gagachat.mobile.prefs.SessionStore
import com.google.android.gms.tasks.Tasks
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Fetch the current token on each attempt; do not persist tokens in WorkManager input data. */
class PushRegistrationWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        if (!SessionStore.isLoggedIn()) return@withContext Result.success()
        try {
            val token = Tasks.await(FirebaseMessaging.getInstance().token, 30, TimeUnit.SECONDS)
            if (token.isBlank()) return@withContext Result.retry()
            if (!SessionStore.isLoggedIn()) return@withContext Result.success()
            Api.post("/devices", JSONObject()
                .put("platform", "android")
                .put("push_token", token)
                .put("device_name", "${Build.MANUFACTURER} ${Build.MODEL}".trim()))
            Result.success()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            Result.retry()
        }
    }

    companion object {
        fun schedule(ctx: Context) {
            val request = OneTimeWorkRequestBuilder<PushRegistrationWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(ctx.applicationContext)
                .enqueueUniqueWork("gaga-push-registration", ExistingWorkPolicy.REPLACE, request)
        }
    }
}
