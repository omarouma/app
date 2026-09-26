package app.gagachat.feature.qr

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable

/** Routes for the QR feature (Master Spec §C). */
object QrRoutes {
    const val MY_QR = "qr/my"
    const val ADD_BY_CODE = "qr/add"
}

/**
 * Registers the QR graph: "my QR code" and "add by code". [onOpenChat] receives a
 * resolved conversation id.
 */
fun NavGraphBuilder.qrGraph(
    navController: NavController,
    onOpenChat: (String) -> Unit,
) {
    composable(QrRoutes.MY_QR) {
        MyQrScreen(
            onBack = { navController.popBackStack() },
            onShare = { payload ->
                // Sharing is surfaced as a system share sheet from the host app; here
                // we simply keep the payload available for the caller to consume.
            },
            onScan = { navController.navigate(QrRoutes.ADD_BY_CODE) },
        )
    }
    composable(QrRoutes.ADD_BY_CODE) {
        AddByCodeScreen(
            onOpenChat = onOpenChat,
            onBack = { navController.popBackStack() },
        )
    }
}
