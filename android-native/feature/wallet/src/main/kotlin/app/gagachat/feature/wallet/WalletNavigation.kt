package app.gagachat.feature.wallet

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable

/** Routes for the Wallet feature (Master Spec §C). */
object WalletRoutes {
    const val WALLET = "wallet"
    const val SEND = "wallet/send"
}

/**
 * Registers the Wallet graph. The coin wallet is backed by the LIVE `wallets`
 * table (one row per user) and the `transactions` jsonb ledger, so balance and
 * activity are authoritative on the server and shared across devices.
 */
fun NavGraphBuilder.walletGraph(navController: NavController) {
    composable(WalletRoutes.WALLET) {
        WalletScreen(
            onSendCoins = { navController.navigate(WalletRoutes.SEND) },
            onBack = { navController.popBackStack() },
        )
    }
    composable(WalletRoutes.SEND) {
        SendCoinsScreen(
            onSent = { navController.popBackStack() },
            onBack = { navController.popBackStack() },
        )
    }
}
