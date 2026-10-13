package app.gagachat.core.data.auth

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Short-lived access token from a recovery deep link, waiting to be used by the
 * "set a new password" screen. Consumed once and cleared (PDF \u00a78).
 *
 * Lives in `core:data` (not the app module) so the auth feature can read it
 * without depending on the app shell.
 */
object PendingRecovery {

    private val _accessToken = MutableStateFlow<String?>(null)
    val accessToken: StateFlow<String?> = _accessToken.asStateFlow()

    val current: String?
        get() = _accessToken.value

    fun set(token: String) {
        _accessToken.value = token
    }

    fun consume(): String? {
        val value = _accessToken.value
        _accessToken.value = null
        return value
    }
}
