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
        val code = AppLocaleStore.current(base)
        val locale = Locale(code)
        Locale.setDefault(locale)
        val config = Configuration(base.resources.configuration)
        config.setLocale(locale)
        return base.createConfigurationContext(config)
    }
}
