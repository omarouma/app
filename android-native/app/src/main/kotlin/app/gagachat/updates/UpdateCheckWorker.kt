package app.gagachat.updates

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.gagachat.core.data.preferences.SettingsPreferences
import app.gagachat.core.data.updates.AppUpdateRepository
import app.gagachat.core.data.updates.UpdateCheckResult
import app.gagachat.core.data.updates.UpdatePreferences
import app.gagachat.push.NotificationHelper
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.flow.first

/**
 * Periodic background update check (the "notify me when GaGa is updated" half of
 * the update system).
 *
 * It asks the trusted registry for the newest published build, and — only if the
 * user has not already been told about that exact version and has not dismissed
 * it — posts one notification that deep-links to the in-app update screen. The
 * notification is deliberately *not* re-posted on every run, and the user's
 * master notification switch and the auto-check preference are both honoured.
 *
 * The worker never downloads anything: a background APK download would be
 * wasteful and battery-hostile. It only informs; the actual download+install
 * happens in the foreground when the user taps through.
 */
@HiltWorker
class UpdateCheckWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val updates: AppUpdateRepository,
    private val updatePreferences: UpdatePreferences,
    private val settingsPreferences: SettingsPreferences,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        if (!updatePreferences.autoCheckEnabled.first()) return Result.success()

        val available = when (val result = updates.checkForUpdate(force = true)) {
            is UpdateCheckResult.Available -> result.update
            is UpdateCheckResult.Failed -> return Result.retry()
            is UpdateCheckResult.UpToDate -> return Result.success()
        }

        if (!updatePreferences.shouldNotify(available.versionCode)) return Result.success()

        val notificationsEnabled = settingsPreferences.notificationsEnabled.first()
        val posted = NotificationHelper.showAppUpdate(
            context = applicationContext,
            versionName = available.versionName,
            required = available.required,
            notificationsEnabled = notificationsEnabled,
        )
        // Record the notification so the same release is never announced twice.
        if (posted) updatePreferences.markNotified(available.versionCode)
        return Result.success()
    }

    companion object {
        /** Unique work name for both the periodic and the on-demand check. */
        const val UNIQUE_NAME = "gaga_update_check"
    }
}
