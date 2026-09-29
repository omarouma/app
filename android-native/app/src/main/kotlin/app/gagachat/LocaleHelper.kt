package app.gagachat

import android.content.Context
import android.content.res.Configuration
import app.gagachat.core.data.preferences.AppLocaleStore
import java.util.Locale

/**
 * Applies the persisted per-app language to the Activity's base context.
 *
 * Called from [MainActivity.attachBaseContext] so every screen is rendered in the
 * selected language (Master Spec §C — language selection & persistence). This
 * works on all supported API levels (minSdk 26) without requiring an AppCompat
 * theme, because the configuration is wrapped directly.
 */
object LocaleHelper {

    fun wrap(base: Context): Context {
        // Defensive: this runs from Activity.attachBaseContext, so a throw here
        // would crash the process before any UI exists. Fall back to the default
        // context if the persisted locale cannot be read/applied.
        return try {
            val code = AppLocaleStore.current(base)
            val locale = Locale(code)
            Locale.setDefault(locale)
            val config = Configuration(base.resources.configuration)
            config.setLocale(locale)
            base.createConfigurationContext(config)
        } catch (t: Throwable) {
            base
        }
    }
}
