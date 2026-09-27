package app.gagachat.push

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Holds a deep link that arrived before the nav host was ready (cold start from
 * a push notification or an external link). The nav host consumes it once and
 * clears it (PDF §8 — deep links).
 */
object PendingDeepLink {

    private val _route = MutableStateFlow<String?>(null)
    val route: StateFlow<String?> = _route.asStateFlow()

    /** The current pending route, if any. */
    val current: String?
        get() = _route.value

    fun set(route: String) {
        _route.value = route
    }

    fun consume(): String? {
        val value = _route.value
        _route.value = null
        return value
    }
}
