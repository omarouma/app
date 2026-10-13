package app.gagachat.core.data.updates

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Hands a verified APK to the system package installer.
 *
 * The APK lives in app-private storage, so it is shared through the app's
 * [FileProvider] with a one-shot read grant instead of a world-readable path.
 * On Android 8+ the user must also grant the app the "install unknown apps"
 * capability; [canInstall] reports whether that has happened and
 * [installPermissionIntent] opens the exact settings page to enable it, so the
 * update flow can guide the user instead of failing silently.
 */
@Singleton
class ApkInstaller @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    /** True when the app is allowed to launch the package installer. */
    fun canInstall(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            runCatching { context.packageManager.canRequestPackageInstalls() }.getOrDefault(false)
        } else {
            true
        }

    /** Settings page that lets the user grant "install unknown apps" to GaGa. */
    fun installPermissionIntent(): Intent? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        } else {
            null
        }

    /** Launches the system installer for [apk]. Returns false if it could not start. */
    fun install(apk: File): Boolean {
        if (!apk.isFile || apk.length() <= 0L) return false
        val uri = runCatching {
            FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apk)
        }.getOrNull() ?: return false
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, APK_MIME)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return runCatching { context.startActivity(intent); true }.getOrDefault(false)
    }

    companion object {
        const val APK_MIME = "application/vnd.android.package-archive"
    }
}
