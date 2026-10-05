package app.gagachat.push

import android.content.Context
import android.provider.Settings
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.network.dto.DeviceRow
import app.gagachat.core.network.rest.SupabaseRestApi
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Registers the FCM push token against the signed-in user's device row so the
 * backend can route notifications. Safe to call repeatedly; the row is matched
 * on (user_id, device_id) and patched when it already exists, so a rotated token
 * updates the same row instead of creating duplicates. Sign-out deletes the row
 * (see `AuthRepository.signOut`), so a previous account stops receiving pushes
 * on this device.
 */
@Singleton
class PushTokenRegistrar @Inject constructor(
    @ApplicationContext private val context: Context,
    private val restApi: SupabaseRestApi,
    private val authRepository: AuthRepository,
) {

    fun enqueueRegistration() {
        val work = androidx.work.OneTimeWorkRequestBuilder<PushTokenRegistrationWorker>()
            .setConstraints(androidx.work.Constraints.Builder()
                .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED).build())
            .setBackoffCriteria(androidx.work.BackoffPolicy.EXPONENTIAL, 30, java.util.concurrent.TimeUnit.SECONDS)
            .build()
        androidx.work.WorkManager.getInstance(context).enqueueUniqueWork(
            "gaga-push-registration", androidx.work.ExistingWorkPolicy.REPLACE, work,
        )
    }

    suspend fun register(token: String) {
        if (token.isBlank()) return
        val session = authRepository.sessionFlow.value ?: return
        restApi.upsertDevice(
                DeviceRow(
                    userId = session.userId,
                    deviceId = deviceId(),
                    pushToken = token,
                    platform = "android",
                    deviceName = deviceName(),
                    appVersion = appVersion(),
                    lastSeenAt = System.currentTimeMillis(),
                ),
            )
    }

    private fun deviceId(): String =
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            ?: "unknown-device"

    private fun deviceName(): String? = runCatching {
        "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"
    }.getOrNull()

    private fun appVersion(): String? = runCatching {
        @Suppress("DEPRECATION")
        context.packageManager.getPackageInfo(context.packageName, 0).versionName
    }.getOrNull()
}
