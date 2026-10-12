package app.gagachat.core.data.updates

import android.content.Context
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
 * installation channel.
 *
 * The registry is the single source of truth for *what* the newest build is, its
 * release notes, and the exact bytes to expect (SHA-256 + size). Everything the
 * in-app updater does — the banner, the notification, the download, the install —
 * is derived from this one document, fetched over HTTPS from the first-party
 * domain. Nothing about an update is ever taken from a push payload.
 *
 * The website must deploy /app-updates/android.json alongside this client.
 */
data class GaGaUpdate(
    val versionCode: Long,
    val versionName: String,
    val releaseNotes: String,
    val required: Boolean,
    /** Where a browser/Play fallback should send the user (kept for the banner). */
    val destination: String,
    /** Direct, first-party APK URL the in-app downloader may fetch (apk channel). */
    val downloadUrl: String = destination,
    /** Expected lowercase hex SHA-256 of the APK, or null when the registry omits it. */
    val sha256: String? = null,
    /** Expected APK size in bytes, or 0 when unknown. */
    val sizeBytes: Long = 0L,
    val installedVersionCode: Long = 0L,
    val installedVersionName: String = "",
    val channel: String = CHANNEL_APK,
) {
    /** True when this update can be downloaded and installed inside the app. */
    val isInAppInstallable: Boolean get() = channel == CHANNEL_APK && downloadUrl.startsWith("https://")

    companion object {
        const val CHANNEL_APK = "apk"
        const val CHANNEL_PLAY = "play"
    }
}

/** Installed build identity, resolved from the package manager. */
data class InstalledVersion(val versionCode: Long, val versionName: String)

/** Outcome of a manual or background update check. */
sealed interface UpdateCheckResult {
    data class Available(val update: GaGaUpdate) : UpdateCheckResult
    data class UpToDate(val installed: InstalledVersion) : UpdateCheckResult
    data class Failed(val reason: String) : UpdateCheckResult
}

@Singleton
class AppUpdateRepository @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private var lastCheckAt = 0L
    private var cached: UpdateCheckResult? = null

    /**
     * Backwards-compatible accessor used by the Today banner and the push handler:
     * returns the offered update, or null when the app is current / the check failed.
     */
    suspend fun availableUpdate(force: Boolean = false): GaGaUpdate? =
        (checkForUpdate(force) as? UpdateCheckResult.Available)?.update

    /**
     * Full check. The manifest is cached for [CHECK_INTERVAL_MS] unless [force] is
     * set. A network failure is surfaced as [UpdateCheckResult.Failed] and never
     * blocks the caller — the app must keep working offline.
     */
    suspend fun checkForUpdate(force: Boolean = true): UpdateCheckResult = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        if (!force && lastCheckAt != 0L && now - lastCheckAt in 0 until CHECK_INTERVAL_MS) {
            return@withContext cached ?: UpdateCheckResult.Failed(REASON_UNKNOWN)
        }

        val installed = installedVersion()
        val result = runCatching {
            val body = fetchManifest() ?: return@runCatching UpdateCheckResult.Failed(REASON_UNREACHABLE)
            evaluate(body, installed)
        }.getOrElse { UpdateCheckResult.Failed(REASON_UNREACHABLE) }

        cached = result
        lastCheckAt = now
        result
    }

    /** Installed version code/name from the package manager. */
    fun installedVersion(): InstalledVersion = runCatching {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        val code = if (Build.VERSION.SDK_INT >= 28) {
            info.longVersionCode
        } else {
            @Suppress("DEPRECATION")
            info.versionCode.toLong()
        }
        InstalledVersion(code, info.versionName.orEmpty())
    }.getOrDefault(InstalledVersion(0L, ""))

    /** The channel this installation was delivered through. */
    fun channel(): String {
        val playInstalled = runCatching {
            if (Build.VERSION.SDK_INT >= 30) {
                context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName == PLAY_PACKAGE
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getInstallerPackageName(context.packageName) == PLAY_PACKAGE
            }
        }.getOrDefault(false)
        return if (playInstalled) GaGaUpdate.CHANNEL_PLAY else GaGaUpdate.CHANNEL_APK
    }

    private fun fetchManifest(): String? {
        val connection = (URL(MANIFEST_URL).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 5_000
            readTimeout = 5_000
            instanceFollowRedirects = false
            setRequestProperty("Accept", "application/json")
        }
        return try {
            if (connection.responseCode != HttpURLConnection.HTTP_OK) return null
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            if (body.length > MAX_MANIFEST_BYTES) null else body
        } finally {
            connection.disconnect()
        }
    }

    private fun evaluate(body: String, installed: InstalledVersion): UpdateCheckResult {
        val json = JSONObject(body)
        if (json.optInt("schemaVersion") != 1 || json.optString("packageName") != context.packageName) {
            return UpdateCheckResult.Failed(REASON_INVALID)
        }
        val channel = channel()
        val target = json.optJSONObject("channels")?.optJSONObject(channel)
            ?: return UpdateCheckResult.UpToDate(installed)
        val publishedCode = target.optLong("versionCode", 0L)
        val latestCode = json.optLong("latestVersionCode", 0L)
        if (!shouldOfferUpdate(installed.versionCode, publishedCode, latestCode)) {
            return UpdateCheckResult.UpToDate(installed)
        }

        val minimum = json.optLong("minimumSupportedVersionCode", 0L)
        val playInstalled = channel == GaGaUpdate.CHANNEL_PLAY
        val destination = if (playInstalled) PLAY_DESTINATION else APK_DESTINATION
        val downloadUrl = target.optString("url").takeIf { it.startsWith("https://") } ?: destination
        return UpdateCheckResult.Available(
            GaGaUpdate(
                versionCode = publishedCode,
                versionName = json.optString("latestVersionName").take(32),
                releaseNotes = json.optString("releaseNotes").take(600),
                required = minimum > 0 && installed.versionCode < minimum,
                destination = destination,
                downloadUrl = downloadUrl,
                sha256 = target.optString("sha256").takeIf { it.isNotBlank() }?.lowercase(),
                sizeBytes = target.optLong("sizeBytes", 0L).coerceAtLeast(0L),
                installedVersionCode = installed.versionCode,
                installedVersionName = installed.versionName,
                channel = channel,
            ),
        )
    }

    companion object {
        private const val CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000L
        private const val MAX_MANIFEST_BYTES = 32_768
        const val MANIFEST_URL = "https://gagachat.app/app-updates/android.json"
        private const val PLAY_PACKAGE = "com.android.vending"
        private const val PLAY_DESTINATION = "https://play.google.com/store/apps/details?id=gagachat.app"
        private const val APK_DESTINATION = "https://gagachat.app/downloads/gaga-latest.apk"

        const val REASON_UNREACHABLE = "Couldn't reach the update server. Check your connection and try again."
        const val REASON_INVALID = "The update information could not be verified."
        const val REASON_UNKNOWN = "Update check failed. Please try again."

        /**
         * The client trusts the per-channel published code, not only the global
         * latest version: an unpublished Play rollout must not prompt Play users.
         */
        fun shouldOfferUpdate(installed: Long, published: Long, latest: Long): Boolean =
            installed >= 0 && published > installed && published <= latest
    }
}
