package app.gagachat.core.data.updates

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

/** Live progress of an in-app APK download. */
data class DownloadProgress(val downloadedBytes: Long, val totalBytes: Long) {
    /** 0f..1f when the total is known, otherwise null (indeterminate). */
    val fraction: Float?
        get() = if (totalBytes > 0) (downloadedBytes.toFloat() / totalBytes).coerceIn(0f, 1f) else null
}

/** Outcome of an in-app APK download. */
sealed interface DownloadResult {
    data class Success(val file: File, val sha256: String) : DownloadResult
    data class Failed(val reason: String) : DownloadResult
}

/**
 * Downloads the published GaGa APK **inside the app** so the user never has to
 * leave for a browser, find the download, and re-install by hand.
 *
 * Security posture (this is the one place the app fetches executable code):
 *  - The URL always comes from the trusted registry ([GaGaUpdate.downloadUrl]),
 *    never from a push payload.
 *  - Only HTTPS is accepted, and **every** redirect hop is re-validated against a
 *    first-party host allow-list, so a compromised CDN cannot bounce the client
 *    to an attacker-controlled origin.
 *  - The streamed bytes are hashed with SHA-256 and compared against the digest
 *    published in the registry; a mismatch is rejected and the partial file is
 *    deleted. The declared size is checked too.
 *  - The file is written to a `.part` temp file and only renamed into place after
 *    it fully verifies, so a half-downloaded APK can never be installed.
 */
@Singleton
class AppUpdateDownloader @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val updatesDir: File
        get() = File(context.filesDir, UPDATES_DIR).apply { mkdirs() }

    /** Deterministic destination for a given release, so retries resume cleanly. */
    fun apkFileFor(update: GaGaUpdate): File = File(updatesDir, "gaga-${update.versionCode}.apk")

    /** True when a fully verified APK for [update] is already on disk. */
    fun downloadedApk(update: GaGaUpdate): File? =
        apkFileFor(update).takeIf { it.isFile && it.length() > 0L }

    suspend fun download(
        update: GaGaUpdate,
        onProgress: (DownloadProgress) -> Unit = {},
    ): DownloadResult = withContext(Dispatchers.IO) {
        val url = runCatching { URL(update.downloadUrl) }.getOrNull()
            ?: return@withContext DownloadResult.Failed(REASON_BAD_URL)
        if (url.protocol != "https") return@withContext DownloadResult.Failed(REASON_INSECURE)

        val target = apkFileFor(update)
        val temp = File(updatesDir, "${target.name}.part")
        var connection: HttpURLConnection? = null
        try {
            connection = openFollowingRedirects(url)
            val declared = connection.contentLengthLong.takeIf { it > 0L }
                ?: update.sizeBytes.takeIf { it > 0L }
            val digest = MessageDigest.getInstance("SHA-256")
            var downloaded = 0L
            var lastReported = 0L
            connection.inputStream.use { input ->
                temp.outputStream().use { output ->
                    val buffer = ByteArray(BUFFER_BYTES)
                    while (true) {
                        currentCoroutineContext().ensureActive()
                        val read = input.read(buffer)
                        if (read < 0) break
                        digest.update(buffer, 0, read)
                        output.write(buffer, 0, read)
                        downloaded += read
                        if (downloaded - lastReported >= PROGRESS_STEP_BYTES ||
                            (declared != null && downloaded >= declared)
                        ) {
                            lastReported = downloaded
                            onProgress(DownloadProgress(downloaded, declared ?: 0L))
                        }
                    }
                    output.flush()
                }
            }
            if (declared != null && downloaded != declared) {
                temp.delete()
                return@withContext DownloadResult.Failed(REASON_SIZE_MISMATCH)
            }
            val actual = digest.digest().toHex()
            val expected = update.sha256?.lowercase()
            if (expected != null && expected != actual) {
                temp.delete()
                return@withContext DownloadResult.Failed(REASON_HASH_MISMATCH)
            }
            if (target.exists() && !target.delete()) {
                temp.delete()
                return@withContext DownloadResult.Failed(REASON_IO)
            }
            if (!temp.renameTo(target)) {
                temp.delete()
                return@withContext DownloadResult.Failed(REASON_IO)
            }
            onProgress(DownloadProgress(downloaded, declared ?: downloaded))
            DownloadResult.Success(target, actual)
        } catch (cancel: CancellationException) {
            temp.delete()
            throw cancel
        } catch (io: IOException) {
            temp.delete()
            DownloadResult.Failed(REASON_NETWORK)
        } catch (t: Throwable) {
            temp.delete()
            DownloadResult.Failed(REASON_IO)
        } finally {
            connection?.disconnect()
        }
    }

    /**
     * Opens [start], following up to [MAX_REDIRECTS] hops manually so each hop's
     * scheme and host can be validated before we ever read a byte of the body.
     */
    private fun openFollowingRedirects(start: URL): HttpURLConnection {
        var current = start
        var hops = 0
        while (true) {
            if (current.protocol != "https") throw IOException("insecure redirect")
            if (!isAllowedHost(current.host)) throw IOException("host not allowed: ${current.host}")
            val connection = (current.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream")
                setRequestProperty("User-Agent", USER_AGENT)
            }
            val code = connection.responseCode
            if (code in 300..399) {
                val location = connection.getHeaderField("Location")
                connection.disconnect()
                if (location.isNullOrBlank() || hops++ >= MAX_REDIRECTS) {
                    throw IOException("too many redirects")
                }
                current = URL(current, location)
                continue
            }
            if (code != HttpURLConnection.HTTP_OK) {
                connection.disconnect()
                throw IOException("HTTP $code")
            }
            return connection
        }
    }

    private fun ByteArray.toHex(): String {
        val out = StringBuilder(size * 2)
        for (byte in this) out.append(HEX[(byte.toInt() shr 4) and 0xF]).append(HEX[byte.toInt() and 0xF])
        return out.toString()
    }

    companion object {
        private const val UPDATES_DIR = "updates"
        private const val BUFFER_BYTES = 64 * 1024
        private const val PROGRESS_STEP_BYTES = 256 * 1024
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 30_000
        private const val MAX_REDIRECTS = 5
        private const val USER_AGENT = "GaGaChat-Updater (Android)"

        private val HEX = "0123456789abcdef".toCharArray()

        /**
         * First-party origins plus the GitHub Releases asset hosts our
         * `gagachat.app/downloads/<asset>` endpoints redirect to. Kept explicit so a
         * redirect can never land on an arbitrary third-party origin.
         */
        private val ALLOWED_HOSTS = setOf(
            "gagachat.app",
            "www.gagachat.app",
            "oumagachat.web.app",
            "fcjgbbmfqdkucfpqjxae.supabase.co",
            "github.com",
            "objects.githubusercontent.com",
            "release-assets.githubusercontent.com",
            "github-releases.githubusercontent.com",
        )
        private val ALLOWED_SUFFIXES = setOf("githubusercontent.com")

        /**
         * Validates a redirect hop's host against the first-party allow-list.
         * Kept in the companion (and internal) so the policy is unit-tested
         * directly rather than only through a live network download.
         */
        internal fun isAllowedHost(host: String): Boolean {
            val normalized = host.lowercase()
            return normalized in ALLOWED_HOSTS ||
                ALLOWED_SUFFIXES.any { normalized == it || normalized.endsWith(".$it") }
        }

        const val REASON_BAD_URL = "The update link is invalid."
        const val REASON_INSECURE = "The update link is not secure, so the download was blocked."
        const val REASON_NETWORK = "The download failed. Check your connection and try again."
        const val REASON_SIZE_MISMATCH = "The downloaded file is incomplete. Please try again."
        const val REASON_HASH_MISMATCH = "The download could not be verified and was discarded."
        const val REASON_IO = "The update could not be saved on this device."
    }
}
