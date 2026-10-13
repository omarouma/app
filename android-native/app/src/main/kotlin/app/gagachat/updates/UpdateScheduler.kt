package app.gagachat.updates

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Schedules the background update check.
 *
 * A unique periodic job (every 12 hours, network-constrained) is the steady
 * state; [checkNow] enqueues a one-shot run so the app can look for a release
 * immediately after launch or when the user taps "Check for updates". Both use
 * the same unique name, so they never pile up.
 */
@Singleton
class UpdateScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val workManager: WorkManager get() = WorkManager.getInstance(context)

    private val networkConstraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    /** Ensures the periodic check is registered (idempotent). */
    fun schedulePeriodic() {
        val request = PeriodicWorkRequestBuilder<UpdateCheckWorker>(12, TimeUnit.HOURS)
            .setConstraints(networkConstraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag(UpdateCheckWorker.UNIQUE_NAME)
            .build()
        workManager.enqueueUniquePeriodicWork(
            UpdateCheckWorker.UNIQUE_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }

    /** Runs a single check as soon as the network allows. */
    fun checkNow() {
        val request = OneTimeWorkRequestBuilder<UpdateCheckWorker>()
            .setConstraints(networkConstraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag(UpdateCheckWorker.UNIQUE_NAME)
            .build()
        workManager.enqueueUniqueWork(
            "${UpdateCheckWorker.UNIQUE_NAME}_now",
            ExistingWorkPolicy.KEEP,
            request,
        )
    }
}
