package app.gagachat.core.network.config

import app.gagachat.core.network.BuildConfig

/**
 * Runtime Supabase configuration. Values are injected at build time from
 * local.properties / CI env (PDF §11 — no privileged secrets in the APK).
 */
data class SupabaseConfig(
    val url: String,
    val anonKey: String,
    val storageBucket: String,
    /** Legacy anon JWT used for Realtime WebSocket authentication. */
    val realtimeAnonKey: String = anonKey,
) {
    val isConfigured: Boolean get() = url.isNotBlank() && anonKey.isNotBlank()

    val restUrl: String get() = "$url/rest/v1"
    val authUrl: String get() = "$url/auth/v1"
    val storageUrl: String get() = "$url/storage/v1"
    val functionsUrl: String get() = "$url/functions/v1"

    /**
     * App Link the emailed auth links return to. Matches the Android App Link
     * filter for `gagachat.app` and Supabase's `uri_allow_list`, so a tap on a
     * sign-in / recovery email opens the app instead of the website.
     */
    val authRedirectUrl: String get() = "$SITE_URL/auth-callback"
    val realtimeUrl: String
        get() {
            val ws = url.replaceFirst("https://", "wss://").replaceFirst("http://", "ws://")
            return "$ws/realtime/v1/websocket"
        }
    val realtimeSocketUrl: String get() = "$realtimeUrl?apikey=$realtimeAnonKey&vsn=1.0.0"

    companion object {
        /** Public site / App Link host used for auth email redirects. */
        const val SITE_URL = "https://gagachat.app"

        fun fromBuildConfig(): SupabaseConfig = SupabaseConfig(
            url = BuildConfig.SUPABASE_URL.trimEnd('/'),
            anonKey = BuildConfig.SUPABASE_ANON_KEY,
            storageBucket = BuildConfig.SUPABASE_STORAGE_BUCKET,
            realtimeAnonKey = BuildConfig.SUPABASE_REALTIME_ANON_KEY,
        )
    }
}
