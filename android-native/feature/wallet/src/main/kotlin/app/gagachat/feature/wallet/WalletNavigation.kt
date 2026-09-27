package app.gagachat.feature.wallet

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable

/** Routes for the Wallet feature (Master Spec §C). */
object WalletRoutes {
    const val WALLET = "wallet"

    /**
     * Retained for the future release, but intentionally NOT registered in the
     * graph while the wallet is "Coming Soon" — exposing an unreachable route
     * would leak unfinished send-coins transfers into the navigation surface.
     */
    const val SEND = "wallet/send"
}

/**
 * Registers the Wallet graph. Until the coin wallet ships, the single entry
 * point renders a "Coming Soon" placeholder so unfinished deposit / withdraw /
 * send / staking flows are never exposed to users (Master Spec §C).
 */
fun NavGraphBuilder.walletGraph(navController: NavController) {
    composable(WalletRoutes.WALLET) {
        WalletComingSoonScreen(
            onBack = { navController.popBackStack() },
        )
    }
}
