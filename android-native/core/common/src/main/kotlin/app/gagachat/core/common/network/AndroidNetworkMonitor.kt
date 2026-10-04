package app.gagachat.core.common.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * [NetworkMonitor] backed by [ConnectivityManager]'s default-network callback
 * (Master Spec §E). The current value is seeded synchronously from
 * `activeNetwork` so the very first frame already knows whether we're online,
 * then kept up to date by the platform callback for the app's lifetime.
 *
 * A process-wide singleton: the callback is registered once in the constructor
 * and never unregistered, which is correct because the monitor lives as long as
 * the process.
 */
@Singleton
class AndroidNetworkMonitor @Inject constructor(
    @ApplicationContext context: Context,
) : NetworkMonitor {

    private val connectivityManager: ConnectivityManager? =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

    private val _isOnline = MutableStateFlow(readCurrentConnectivity())
    override val isOnline: StateFlow<Boolean> = _isOnline.asStateFlow()

    private val _isMetered = MutableStateFlow(readCurrentMetered())
    override val isMetered: StateFlow<Boolean> = _isMetered.asStateFlow()

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            refresh()
        }

        override fun onLost(network: Network) {
            refresh()
        }

        override fun onCapabilitiesChanged(
            network: Network,
            networkCapabilities: NetworkCapabilities,
        ) {
            refresh()
        }

        override fun onUnavailable() {
            refresh()
        }
    }

    private fun refresh() {
        _isOnline.value = readCurrentConnectivity()
        _isMetered.value = readCurrentMetered()
    }

    init {
        // If ConnectivityManager is somehow unavailable we optimistically assume
        // online so the app never shows a false "offline" banner.
        runCatching { connectivityManager?.registerDefaultNetworkCallback(callback) }
    }

    override fun isCurrentlyOnline(): Boolean = readCurrentConnectivity()

    override fun isCurrentlyMetered(): Boolean = readCurrentMetered()

    /**
     * A network is treated as metered unless it advertises
     * [NetworkCapabilities.NET_CAPABILITY_NOT_METERED]. Unknown connectivity is
     * reported as unmetered so an explicit user choice is never silently
     * overridden.
     */
    private fun readCurrentMetered(): Boolean {
        val manager = connectivityManager ?: return false
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    }

    /**
     * Reads connectivity from the active network. We require only
     * [NetworkCapabilities.NET_CAPABILITY_INTERNET] (not `VALIDATED`) so that a
     * network which is up but has not yet completed validation — a common state
     * for the first seconds after connecting — is not reported as offline.
     */
    private fun readCurrentConnectivity(): Boolean {
        val manager = connectivityManager ?: return true
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
