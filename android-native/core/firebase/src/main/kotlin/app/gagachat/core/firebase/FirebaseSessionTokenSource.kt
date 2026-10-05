package app.gagachat.core.firebase

import app.gagachat.core.network.auth.SessionTokenSource
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Firebase-first bearer-token source (migration spec §2, §3).
 *
 * When the Firebase-first build is active the credential the trusted backend
 * expects is a **Firebase ID token** (carrying the canonical `gaga_user_id`
 * custom claim), not a Supabase access token. This source supplies exactly that,
 * so the shared HTTP client keeps working unchanged.
 *
 * It is deliberately inert unless `authFirst` is on: in the Supabase-only and
 * hybrid builds it returns `null`, the interceptor falls through to the Supabase
 * source, and nothing about the proven path changes. Because it has the lowest
 * [priority] value it is consulted first whenever it *is* active.
 */
@Singleton
class FirebaseSessionTokenSource @Inject constructor(
    private val idTokens: FirebaseIdTokenProvider,
    private val config: FirebaseTransportConfig,
) : SessionTokenSource {

    /** Consulted before the Supabase source (which uses priority 10). */
    override val priority: Int = 0

    override suspend fun ensureFresh(force: Boolean): String? {
        if (!config.authFirst) return null
        // `force` maps straight through: the SDK refreshes the token (and thus
        // picks up a freshly-injected `gaga_user_id` claim) on demand.
        return idTokens.current(forceRefresh = force)?.value
    }
}
