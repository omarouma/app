package app.gagachat.feature.chat.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import app.gagachat.feature.chat.presentation.ChatRoute

object ChatRoutes {
    const val ARG_CONVERSATION_ID = "conversationId"
    const val CHAT = "chat/{$ARG_CONVERSATION_ID}"

    fun chat(conversationId: String): String = "chat/$conversationId"
}

fun NavGraphBuilder.chatScreen(
    navController: NavController,
    onStartCall: (conversationId: String, isVideo: Boolean) -> Unit,
) {
    composable(
        route = ChatRoutes.CHAT,
        arguments = listOf(navArgument(ChatRoutes.ARG_CONVERSATION_ID) { type = NavType.StringType }),
    ) {
        ChatRoute(
            onNavigateBack = { navController.popBackStack() },
            onStartCall = onStartCall,
        )
    }
}
