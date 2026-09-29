package app.gagachat.diagnostics

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Process-wide crash capture.
 *
 * This is intentionally dependency-free (no Hilt, no coroutines, no Compose) so
 * it can be installed from an `androidx.startup` [Initializer] *before* any other
 * ContentProvider (including ZEGO's `PrebuiltCallInitializer`) runs. That makes
 * it able to capture crashes that happen during process start-up — the exact
 * class of failure we are chasing.
 *
 * A captured report is written to three places so it is always retrievable:
 *  1. logcat (`GaGaCrash` tag) — for `adb logcat -b crash`.
 *  2. the app's external files dir — `/sdcard/Android/data/<pkg>/files/`.
 *  3. the public **Downloads** folder (`gaga_crash.txt`) — reachable from any
 *     file manager, so a non-technical user can simply open it and share it.
 */
object CrashReporter {

    private const val TAG = "GaGaCrash"
    private const val FILE_NAME = "gaga_crash.txt"

    @Volatile
    private var installed = false

    /** Installs the global uncaught-exception handler. Safe to call repeatedly. */
    @Synchronized
    fun install(context: Context) {
        if (installed) return
        installed = true
        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            runCatching {
                val report = buildReport(app, thread, throwable)
                Log.e(TAG, report)
                persist(app, report)
            }.onFailure { Log.e(TAG, "Failed to persist crash report", it) }
            // Never swallow the crash: hand off to the platform handler so the
            // process still terminates and the system records the failure.
            previous?.uncaughtException(thread, throwable)
        }
        Log.i(TAG, "CrashReporter installed")
    }

    private fun buildReport(app: Context, thread: Thread, throwable: Throwable): String = buildString {
        appendLine("================ GaGa crash report ================")
        appendLine("time    : ${SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())}")
        appendLine("thread  : ${thread.name}")
        appendLine("device  : ${Build.MANUFACTURER} ${Build.MODEL}")
        appendLine("android : ${Build.VERSION.RELEASE} (sdk ${Build.VERSION.SDK_INT})")
        appendLine("abis    : ${Build.SUPPORTED_ABIS.joinToString()}")
        appendLine("app     : ${versionName(app)} (${packageName(app)})")
        appendLine("===================================================")
        appendLine(Log.getStackTraceString(throwable))
    }

    private fun versionName(app: Context): String = runCatching {
        app.packageManager.getPackageInfo(app.packageName, 0).versionName ?: "?"
    }.getOrDefault("?")

    private fun packageName(app: Context): String = app.packageName

    /** Writes [text] to every retrievable location, ignoring individual failures. */
    fun persist(app: Context, text: String) {
        runCatching {
            val dir = app.getExternalFilesDir(null) ?: app.filesDir
            File(dir, FILE_NAME).writeText(text)
        }
        runCatching { File(app.filesDir, FILE_NAME).writeText(text) }
        runCatching { writeToDownloads(app, text) }
    }

    private fun writeToDownloads(app: Context, text: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, FILE_NAME)
                put(MediaStore.Downloads.MIME_TYPE, "text/plain")
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            }
            val resolver = app.contentResolver
            // Replace any previous report so the file is always the latest crash.
            runCatching {
                resolver.delete(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                    "${MediaStore.Downloads.DISPLAY_NAME} = ?",
                    arrayOf(FILE_NAME),
                )
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return
            resolver.openOutputStream(uri)?.use { it.write(text.toByteArray()) }
        } else {
            @Suppress("DEPRECATION")
            val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            File(dir, FILE_NAME).writeText(text)
        }
    }

    /** Returns the most recent crash report stored in the app's files, if any. */
    fun lastReport(app: Context): String? = runCatching {
        val external = app.getExternalFilesDir(null)
        val candidates = listOfNotNull(
            external?.let { File(it, FILE_NAME) },
            File(app.filesDir, FILE_NAME),
        )
        candidates.firstOrNull { it.exists() }?.readText()
    }.getOrNull()

    /** Clears the stored crash report (called once the user has acknowledged it). */
    fun clear(app: Context) {
        runCatching { app.getExternalFilesDir(null)?.let { File(it, FILE_NAME).delete() } }
        runCatching { File(app.filesDir, FILE_NAME).delete() }
    }
}
