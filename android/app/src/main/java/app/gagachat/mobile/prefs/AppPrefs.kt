package app.gagachat.mobile.prefs

import android.content.Context
import android.content.SharedPreferences
import app.gagachat.mobile.BuildConfig
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner

/**
 * Non-sensitive preferences only. Anything secret lives in SessionStore
 * (C-06: EncryptedSharedPreferences) — tokens NEVER in plain prefs.
 */
object AppPrefs {

    private const val FILE = "gaga_settings"
    private const val FILE_NOTIF = "notif_ids"

    const val THEME_SYSTEM = "system"
    const val THEME_LIGHT = "light"
    const val THEME_DARK = "dark"

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    // ---------- session flag ----------
    fun hasSession(ctx: Context): Boolean = prefs(ctx).getBoolean("session_active", false)
    fun setSession(ctx: Context, on: Boolean) = prefs(ctx).edit().putBoolean("session_active", on).apply()

    // ---------- server endpoint (C-01) ----------
    fun apiBase(ctx: Context): String {
        if (!BuildConfig.ALLOW_SERVER_OVERRIDE) return BuildConfig.API_BASE
        return prefs(ctx).getString("api_base", BuildConfig.API_BASE) ?: BuildConfig.API_BASE
    }
    fun setApiBase(ctx: Context, url: String) {
        if (BuildConfig.ALLOW_SERVER_OVERRIDE) {
            prefs(ctx).edit().putString("api_base", url).apply()
        }
    }

    // ---------- theme ----------
    fun theme(ctx: Context): String = prefs(ctx).getString("theme", THEME_SYSTEM) ?: THEME_SYSTEM
    fun setTheme(ctx: Context, t: String) = prefs(ctx).edit().putString("theme", t).apply()

    // ---------- locale ----------
    fun locale(ctx: Context): String? = prefs(ctx).getString("locale", null)
    fun setLocale(ctx: Context, tag: String?) = prefs(ctx).edit().putString("locale", tag).apply()

    // ---------- biometric lock ----------
    fun biometricEnabled(ctx: Context): Boolean = prefs(ctx).getBoolean("biometric", false)
    fun setBiometric(ctx: Context, on: Boolean) = prefs(ctx).edit().putBoolean("biometric", on).apply()

    // Local notification controls. Calls still ring to avoid silently missing them.
    fun messageNotifications(ctx: Context): Boolean = prefs(ctx).getBoolean("message_notifications", true)
    fun setMessageNotifications(ctx: Context, on: Boolean) =
        prefs(ctx).edit().putBoolean("message_notifications", on).apply()
    fun messagePreviews(ctx: Context): Boolean = prefs(ctx).getBoolean("message_previews", false)
    fun setMessagePreviews(ctx: Context, on: Boolean) =
        prefs(ctx).edit().putBoolean("message_previews", on).apply()

    // ---------- stable notification ids (m-05) ----------
    fun nextNotifId(ctx: Context): Int {
        val p = ctx.getSharedPreferences(FILE_NOTIF, Context.MODE_PRIVATE)
        var id = p.getInt("next", 10000)
        if (id >= 19999) id = 10000
        p.edit().putInt("next", id + 1).apply()
        return id
    }

    // ---------- foreground tracking (notification suppression) ----------
    // Registered once from GaGaApp; avoids needing an Activity reference
    // from the service's notification-suppression check.
    private val lifecycleObserver = object : DefaultLifecycleObserver {
        @Volatile var foreground: Boolean = false
        override fun onStart(owner: LifecycleOwner) { foreground = true }
        override fun onStop(owner: LifecycleOwner) { foreground = false }
    }

    fun beginForegroundTracking() {
        runCatching {
            ProcessLifecycleOwner.get().lifecycle.addObserver(lifecycleObserver)
        }
    }

    fun isAppInForeground(): Boolean = lifecycleObserver.foreground
}
