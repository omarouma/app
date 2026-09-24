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
 * backend can route notifications (PDF §8, §7.1 `devices`). Safe to call
 * repeatedly — the upsert is keyed on (user_id, device_id).
 */
@Singleton
class PushTokenRegistrar @Inject constructor(
    @ApplicationContext private val context: Context,
    private val restApi: SupabaseRestApi,
    private val authRepository: AuthRepository,
) {

    suspend fun register(token: String) {
        val session = authRepository.sessionFlow.value ?: return
        runCatching {
            restApi.upsertDevice(
                DeviceRow(
                    userId = session.userId,
                    deviceId = deviceId(),
                    pushToken = token,
                    platform = "android",
                    lastActive = System.currentTimeMillis(),
                    appVersion = appVersion(),
                ),
            )
        }
    }

    private fun deviceId(): String =
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            ?: "unknown-device"

    private fun appVersion(): String? = runCatching {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName
    }.getOrNull()
}
