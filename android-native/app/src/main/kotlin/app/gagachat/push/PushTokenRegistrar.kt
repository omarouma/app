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
 * on (user_id, token) and patched when it already exists.
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
                    token = deviceId(),
                    fcmToken = token,
                    platform = "android",
                    deviceName = deviceName(),
                    lastSeenAt = System.currentTimeMillis(),
                ),
            )
        }
    }

    private fun deviceId(): String =
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            ?: "unknown-device"

    private fun deviceName(): String? = runCatching {
        "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"
    }.getOrNull()
}
