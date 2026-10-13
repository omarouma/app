package app.gagachat.push

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Tokens delivered by an emailed auth link that returned to the app through the
 * `https://gagachat.app/auth-callback` App Link.
 *
 * On the free tier Supabase's built-in mailer cannot embed a one-time code, so
 * every sign-in / recovery email contains a link. Redirecting that link back
 * into the app (instead of the website) lets a single tap complete the flow.
 *
 * @property type `magiclink` for a passwordless sign-in, `recovery` for a
 *   password reset.
 */
data class AuthCallback(
    val accessToken: String,
    val refreshToken: String,
    val expiresInSeconds: Long,
    val type: String,
)

/**
 * Holds an auth callback that arrived before the app shell was ready (cold start
 * from an emailed link). The shell consumes it once and clears it (PDF \u00a78).
 */
object PendingAuthLink {

    private val _callback = MutableStateFlow<AuthCallback?>(null)
    val callback: StateFlow<AuthCallback?> = _callback.asStateFlow()

    val current: AuthCallback?
        get() = _callback.value

    fun set(value: AuthCallback) {
        _callback.value = value
    }

    fun consume(): AuthCallback? {
        val value = _callback.value
        _callback.value = null
        return value
    }
}
