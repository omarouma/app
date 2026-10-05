package app.gagachat.core.firebase

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Supplies fresh Firebase ID tokens for the Firebase-first path (migration spec
 * §2, §3).
 *
 * This replaces the legacy "mint a custom token whose uid == Supabase userId"
 * bridge ([FirebaseTokenClient]): once Firebase *is* the identity provider there
 * is nothing to mint — the SDK already holds a signed ID token, and the trusted
 * backend has injected the canonical `gaga_user_id` custom claim into it.
 *
 * The claim is surfaced here so callers can read the canonical GaGa user id
 * without an extra network round-trip, while the raw token is what gets sent as
 * `Authorization: Bearer …` to the edge functions and (transparently) to
 * Firestore.
 */
@Singleton
class FirebaseIdTokenProvider @Inject constructor(
    private val environment: FirebaseEnvironment,
) {
    /**
     * @param value        the raw ID token to send as a bearer credential.
     * @param gagaUserId   the canonical GaGa user id from the custom claim, or
     *                     `null` until the account has been mapped by the backend.
     * @param emailVerified whether the backing email is verified.
     * @param expiresAtMillis wall-clock expiry read from the token's `exp` claim
     *                     (Firebase ID tokens live one hour), so the session can
     *                     be refreshed proactively.
     */
    data class Token(
        val value: String,
        val gagaUserId: String?,
        val emailVerified: Boolean,
        val expiresAtMillis: Long,
    )

    /**
     * Returns the current ID token. Pass `forceRefresh = true` right after the
     * identity has been mapped so the freshly injected `gaga_user_id` claim is
     * present in the token the app will use.
     */
    suspend fun current(forceRefresh: Boolean = false): Token? {
        val user = environment.auth?.currentUser ?: return null
        val result = runCatching { user.getIdToken(forceRefresh).awaitResult() }.getOrNull() ?: return null
        val token = result.token ?: return null
        val claims = result.claims
        // `exp` is seconds-since-epoch and is always present; fall back to a
        // conservative hour so a malformed claim can never yield a stale token.
        val expSeconds = (claims?.get("exp") as? Number)?.toLong()
        return Token(
            value = token,
            gagaUserId = claims?.get("gaga_user_id") as? String,
            emailVerified = claims?.get("email_verified") == true,
            expiresAtMillis = expSeconds?.let { it * 1000L }
                ?: (System.currentTimeMillis() + DEFAULT_TTL_MILLIS),
        )
    }

    /** A freshly-refreshed token — used after a claim change or a 401. */
    suspend fun fresh(): Token? = current(forceRefresh = true)

    private companion object {
        /** Firebase ID tokens live for one hour; used only if `exp` is absent. */
        const val DEFAULT_TTL_MILLIS = 55 * 60_000L
    }
}
