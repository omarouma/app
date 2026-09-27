package app.gagachat.core.data.preferences

import android.content.Context

/**
 * Synchronous mirror of the persisted app language.
 *
 * The language preference lives in the async [SettingsPreferences] DataStore, but
 * applying a locale must happen in `Activity.attachBaseContext` before any
 * composition runs — a place where suspending/flow reads are not possible. This
 * tiny SharedPreferences mirror is written alongside the DataStore value so the
 * locale can be read synchronously on every process start (Master Spec §C).
 */
object AppLocaleStore {
    private const val PREFS = "gaga_locale"
    private const val KEY = "lang"
    const val DEFAULT = "en"

    fun persist(context: Context, code: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, code)
            .apply()
    }

    fun current(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, DEFAULT)
            ?: DEFAULT
}
