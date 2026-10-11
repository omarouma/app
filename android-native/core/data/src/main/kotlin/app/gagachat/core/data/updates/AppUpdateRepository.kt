package app.gagachat.core.data.updates

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import dagger.hilt.android.qualifiers.ApplicationContext
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Reads the trusted, public GaGa release registry; never accepts APK URLs from FCM.
 * An update is offered only when it has actually been published for the user's
 * installation channel. Launching the system browser or Play is user-confirmed.
 *
 * The website must deploy /app-updates/android.json alongside this client.
 */
data class GaGaUpdate(
    val versionCode: Long,
    val versionName: String,
    val releaseNotes: String,
    val required: Boolean,
    val destination: String,
)

@Singleton
class AppUpdateRepository @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private var lastCheckAt = 0L
    private var cached: GaGaUpdate? = null

    suspend fun availableUpdate(force: Boolean = false): GaGaUpdate? = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        if (!force && lastCheckAt != 0L && now - lastCheckAt in 0 until CHECK_INTERVAL_MS) {
            return@withContext cached
        }

        val release = runCatching {
            val connection = (URL(MANIFEST_URL).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 5_000
                readTimeout = 5_000
                instanceFollowRedirects = false
                setRequestProperty("Accept", "application/json")
            }
            try {
                if (connection.responseCode != HttpURLConnection.HTTP_OK) return@runCatching null
                val body = connection.inputStream.bufferedReader().use { it.readText() }
                if (body.length > 32_768) return@runCatching null
                parse(body)
            } finally {
                connection.disconnect()
            }
        }.getOrNull()

        // Failure must never block Chats or lock the user out of the application.
        if (release != null) {
            cached = release
            lastCheckAt = now
        }
        cached
    }

    private fun parse(body: String): GaGaUpdate? {
        val json = JSONObject(body)
        if (json.optInt("schemaVersion") != 1 || json.optString("packageName") != context.packageName) return null
        val installedCode = if (Build.VERSION.SDK_INT >= 28) {
            context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(context.packageName, 0).versionCode.toLong()
        }

        val playInstalled = runCatching {
            if (Build.VERSION.SDK_INT >= 30) {
                context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName == "com.android.vending"
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getInstallerPackageName(context.packageName) == "com.android.vending"
            }
        }.getOrDefault(false)
        val channel = if (playInstalled) "play" else "apk"
        val target = json.optJSONObject("channels")?.optJSONObject(channel) ?: return null
        val publishedCode = target.optLong("versionCode", 0L)
        val latest = json.optLong("latestVersionCode", 0L)
        if (!shouldOfferUpdate(installedCode, publishedCode, latest)) return null

        val minimum = json.optLong("minimumSupportedVersionCode", 0L)
        val trustedUrl = if (playInstalled) PLAY_DESTINATION else APK_DESTINATION
        return GaGaUpdate(
            versionCode = publishedCode,
            versionName = json.optString("latestVersionName").take(32),
            releaseNotes = json.optString("releaseNotes").take(600),
            required = minimum > 0 && installedCode < minimum,
            destination = trustedUrl,
        )
    }

    companion object {
        private const val CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000L
        private const val MANIFEST_URL = "https://gagachat.app/app-updates/android.json"
        private const val PLAY_DESTINATION = "https://play.google.com/store/apps/details?id=gagachat.app"
        private const val APK_DESTINATION = "https://gagachat.app/downloads/gaga-latest.apk"

        /**
         * The client trusts the per-channel published code, not only the global
         * latest version: an unpublished Play rollout must not prompt Play users.
         */
        fun shouldOfferUpdate(installed: Long, published: Long, latest: Long): Boolean =
            installed >= 0 && published > installed && published <= latest
    }
}
