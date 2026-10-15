package app.gagachat.feature.qr

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable

/** Routes for the QR feature (Master Spec §C). */
object QrRoutes {
    const val MY_QR = "qr/my"
    const val ADD_BY_CODE = "qr/add"
    const val SCAN = "qr/scan"
}

/**
 * Registers the QR graph: "my QR code" and "add by code". [onOpenChat] receives a
 * resolved conversation id.
 */
fun NavGraphBuilder.qrGraph(
    navController: NavController,
    onOpenChat: (String) -> Unit,
    onOpenProfile: (String) -> Unit = {},
) {
    composable(QrRoutes.MY_QR) {
        // Share + copy-link are handled inside MyQrScreen via the system share sheet
        // and the clipboard, so no host callback is required here.
        MyQrScreen(
            onBack = { navController.popBackStack() },
            onScan = { navController.navigate(QrRoutes.ADD_BY_CODE) },
        )
    }
    composable(QrRoutes.SCAN) {
        AddByCodeScreen(
            startWithCamera = true,
            onOpenChat = onOpenChat,
            onOpenProfile = onOpenProfile,
            onBack = { navController.popBackStack() },
        )
    }
    composable(QrRoutes.ADD_BY_CODE) {
        AddByCodeScreen(
            onOpenChat = onOpenChat,
            onOpenProfile = onOpenProfile,
            onBack = { navController.popBackStack() },
        )
    }
}
