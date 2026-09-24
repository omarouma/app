package app.gagachat.core.network.session

/**
 * Persisted authentication session. Stored encrypted at rest (PDF §11).
 */
data class AuthSession(
    val userId: String,
    val accessToken: String,
    val refreshToken: String,
    val expiresAtMillis: Long,
    val email: String? = null,
    val phone: String? = null,
    val displayName: String? = null,
) {
    /** Refresh proactively a minute before expiry (PDF §3 — background refresh). */
    fun needsRefresh(nowMillis: Long): Boolean = nowMillis >= expiresAtMillis - 60_000L
}
