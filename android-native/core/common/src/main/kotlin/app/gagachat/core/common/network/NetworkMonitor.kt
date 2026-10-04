package app.gagachat.core.common.network

import kotlinx.coroutines.flow.StateFlow

/**
 * Reactive connectivity source (Master Spec §E — offline handling, PDF §7).
 *
 * The app is local-first, so a screen can almost always render cached content.
 * The one thing it cannot do offline is *reach the server*. This monitor lets the
 * UI distinguish "the request failed because the device is offline" (show the
 * dedicated OFFLINE state / banner and retry automatically on reconnect) from
 * "the request failed for some other reason" (show a generic error with Retry).
 *
 * Implementations must be cheap to observe and safe to read from any thread.
 */
interface NetworkMonitor {

    /** Emits `true` while the device has a usable internet connection. */
    val isOnline: StateFlow<Boolean>

    /**
     * Emits `true` while the active network is metered (mobile data / hotspot).
     * Used by the "Data & Storage" media auto-download policy to decide whether
     * a Wi-Fi-only user should be spared a cellular download. When connectivity
     * is unknown we report `false` (unmetered) so we never wrongly block a fetch
     * that the user explicitly allowed.
     */
    val isMetered: StateFlow<Boolean>

    /**
     * Synchronous snapshot of the current connectivity, for one-shot decisions
     * taken while mapping an error to a screen state.
     */
    fun isCurrentlyOnline(): Boolean

    /** Synchronous snapshot of whether the active network is metered. */
    fun isCurrentlyMetered(): Boolean
}
