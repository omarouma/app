package app.gagachat.feature.calls.navigation

import android.net.Uri
import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import app.gagachat.feature.calls.presentation.ActiveCallRoute
import app.gagachat.feature.calls.presentation.CallHistoryRoute
import app.gagachat.feature.calls.presentation.IncomingCallRoute

object CallRoutes {
    const val CALL_HISTORY = "calls"
    const val ARG_CONVERSATION_ID = "conversationId"
    const val ARG_VIDEO = "video"
    const val ARG_CALL_ID = "callId"

    /** Outgoing call: the surface places the call as soon as it composes. */
    const val ACTIVE_CALL =
        "call/active?$ARG_CONVERSATION_ID={$ARG_CONVERSATION_ID}&$ARG_VIDEO={$ARG_VIDEO}"

    /**
     * Incoming call: the surface rings and only joins the room once the user
     * accepts. Reached from the full-screen call notification or from a live
     * Realtime invite while the app is in the foreground.
     */
    const val INCOMING_CALL =
        "call/incoming?$ARG_CONVERSATION_ID={$ARG_CONVERSATION_ID}" +
            "&$ARG_CALL_ID={$ARG_CALL_ID}&$ARG_VIDEO={$ARG_VIDEO}"

    fun activeCall(conversationId: String, isVideo: Boolean): String =
        "call/active?$ARG_CONVERSATION_ID=${Uri.encode(conversationId)}&$ARG_VIDEO=$isVideo"

    fun incomingCall(conversationId: String, callId: String?, isVideo: Boolean): String =
        "call/incoming?$ARG_CONVERSATION_ID=${Uri.encode(conversationId)}" +
            "&$ARG_CALL_ID=${Uri.encode(callId.orEmpty())}&$ARG_VIDEO=$isVideo"
}

fun NavGraphBuilder.callHistoryScreen(
    navController: NavController,
    onOpenConversation: (String) -> Unit,
    onStartCall: (conversationId: String, isVideo: Boolean) -> Unit,
) {
    composable(CallRoutes.CALL_HISTORY) {
        CallHistoryRoute(
            onNavigateBack = { navController.popBackStack() },
            onOpenConversation = onOpenConversation,
            onStartCall = onStartCall,
        )
    }
}

fun NavGraphBuilder.activeCallScreen(
    navController: NavController,
    onCallFinished: () -> Unit,
) {
    composable(
        route = CallRoutes.ACTIVE_CALL,
        arguments = listOf(
            navArgument(CallRoutes.ARG_CONVERSATION_ID) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
            navArgument(CallRoutes.ARG_VIDEO) {
                type = NavType.BoolType
                defaultValue = false
            },
        ),
    ) { backStackEntry ->
        ActiveCallRoute(
            conversationId = backStackEntry.arguments?.getString(CallRoutes.ARG_CONVERSATION_ID),
            isVideo = backStackEntry.arguments?.getBoolean(CallRoutes.ARG_VIDEO) ?: false,
            onCallFinished = {
                onCallFinished()
                navController.popBackStack()
            },
        )
    }
}

fun NavGraphBuilder.incomingCallScreen(
    navController: NavController,
    onCallFinished: () -> Unit,
) {
    composable(
        route = CallRoutes.INCOMING_CALL,
        arguments = listOf(
            navArgument(CallRoutes.ARG_CONVERSATION_ID) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
            navArgument(CallRoutes.ARG_CALL_ID) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
            navArgument(CallRoutes.ARG_VIDEO) {
                type = NavType.BoolType
                defaultValue = false
            },
        ),
    ) { backStackEntry ->
        IncomingCallRoute(
            conversationId = backStackEntry.arguments?.getString(CallRoutes.ARG_CONVERSATION_ID),
            callId = backStackEntry.arguments?.getString(CallRoutes.ARG_CALL_ID),
            isVideo = backStackEntry.arguments?.getBoolean(CallRoutes.ARG_VIDEO) ?: false,
            onCallFinished = {
                onCallFinished()
                navController.popBackStack()
            },
        )
    }
}
