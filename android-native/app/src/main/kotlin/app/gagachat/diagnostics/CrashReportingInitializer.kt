package app.gagachat.diagnostics

import android.content.Context
import androidx.startup.Initializer

/**
 * Installs [CrashReporter] as the very first thing that runs in the process.
 *
 * `androidx.startup.InitializationProvider` is the first ContentProvider in the
 * merged manifest, so this initializer executes *before* ZEGO's
 * `PrebuiltCallInitializer` and before `Application.onCreate()`. Any crash that
 * happens afterwards — including one thrown by another ContentProvider during
 * start-up — is therefore captured to a retrievable file.
 */
class CrashReportingInitializer : Initializer<Unit> {
    override fun create(context: Context) {
        CrashReporter.install(context)
    }

    override fun dependencies(): List<Class<out Initializer<*>>> = emptyList()
}
