package app.gagachat.core.network.auth

/**
 * Supplies a bearer token for backend calls.
 *
 * The migration runs two auth systems side by side (migration spec §2): the
 * legacy Supabase session and the Firebase-first session. Rather than hard-code
 * one, the network layer asks every registered [SessionTokenSource] in
 * [priority] order and uses the first non-null token. That keeps the proven
 * Supabase path and the Firebase path working from the same HTTP client without
 * either module depending on the other:
 *
 *   • `:core:firebase` contributes the Firebase source
 *     (`FirebaseSessionTokenSource`, priority 0), which returns a fresh Firebase
 *     ID token — but only when the Firebase-first build is active, and `null`
 *     otherwise;
 *   • `:core:network` contributes the Supabase source ([AuthTokenRefresher],
 *     priority 10), the fallback for the Supabase-only and hybrid builds.
 *
 * Because the Firebase source is inert unless `authFirst` is on, consulting it
 * first is safe: the Supabase-only build simply falls through to the Supabase
 * token exactly as before.
 */
interface SessionTokenSource {
    /** Lower values are consulted first. */
    val priority: Int

    /**
     * Returns a usable bearer token, refreshing it first when needed.
     *
     * @param force refresh even when the cached token still looks valid (used
     *   after the server rejected a token with 401).
     */
    suspend fun ensureFresh(force: Boolean = false): String?
}
