package app.gagachat.feature.chat.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import app.gagachat.feature.chat.presentation.ChatInfoRoute
import app.gagachat.feature.chat.presentation.ChatRoute

object ChatRoutes {
    const val ARG_CONVERSATION_ID = "conversationId"
    const val CHAT = "chat/{$ARG_CONVERSATION_ID}"
    const val CHAT_INFO = "chat_info/{$ARG_CONVERSATION_ID}"

    fun chat(conversationId: String): String = "chat/$conversationId"
    fun chatInfo(conversationId: String): String = "chat_info/$conversationId"
}

fun NavGraphBuilder.chatScreen(
    navController: NavController,
    onStartCall: (conversationId: String, isVideo: Boolean) -> Unit,
    onOpenProfile: (userId: String) -> Unit,
) {
    composable(
        route = ChatRoutes.CHAT,
        arguments = listOf(navArgument(ChatRoutes.ARG_CONVERSATION_ID) { type = NavType.StringType }),
    ) {
        ChatRoute(
            onNavigateBack = { navController.popBackStack() },
            onStartCall = onStartCall,
            onOpenProfile = onOpenProfile,
            onOpenChatInfo = { conversationId ->
                navController.navigate(ChatRoutes.chatInfo(conversationId))
            },
        )
    }
}

fun NavGraphBuilder.chatInfoScreen(
    navController: NavController,
    onStartCall: (conversationId: String, isVideo: Boolean) -> Unit,
    onOpenProfile: (userId: String) -> Unit,
    onSendMoney: () -> Unit,
) {
    composable(
        route = ChatRoutes.CHAT_INFO,
        arguments = listOf(navArgument(ChatRoutes.ARG_CONVERSATION_ID) { type = NavType.StringType }),
    ) {
        ChatInfoRoute(
            onNavigateBack = { navController.popBackStack() },
            onStartCall = onStartCall,
            onOpenProfile = onOpenProfile,
            onSendMoney = onSendMoney,
        )
    }
}
