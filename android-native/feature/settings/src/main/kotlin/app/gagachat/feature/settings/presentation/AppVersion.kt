package app.gagachat.feature.settings.presentation

import android.content.Context

/**
 * Resolves the installed app's version name from the package manager so the
 * value always reflects the real build (the settings feature module does not
 * own the app's BuildConfig).
 */
internal fun appVersionLabel(context: Context): String =
    runCatching {
        val pm = context.packageManager
        val info = pm.getPackageInfo(context.packageName, 0)
        info.versionName
    }.getOrNull()?.takeIf { it.isNotBlank() } ?: "—"
