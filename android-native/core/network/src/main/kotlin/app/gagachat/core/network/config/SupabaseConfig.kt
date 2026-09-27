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
) {
    val isConfigured: Boolean get() = url.isNotBlank() && anonKey.isNotBlank()

    val restUrl: String get() = "$url/rest/v1"
    val authUrl: String get() = "$url/auth/v1"
    val storageUrl: String get() = "$url/storage/v1"
    val realtimeUrl: String
        get() {
            val ws = url.replaceFirst("https://", "wss://").replaceFirst("http://", "ws://")
            return "$ws/realtime/v1/websocket"
        }

    companion object {
        fun fromBuildConfig(): SupabaseConfig = SupabaseConfig(
            url = BuildConfig.SUPABASE_URL.trimEnd('/'),
            anonKey = BuildConfig.SUPABASE_ANON_KEY,
            storageBucket = BuildConfig.SUPABASE_STORAGE_BUCKET,
        )
    }
}
