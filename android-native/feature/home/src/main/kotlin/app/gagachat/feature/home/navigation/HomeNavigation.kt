package app.gagachat.feature.home.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import app.gagachat.feature.home.presentation.HomeRoute

object HomeRoutes {
    const val HOME = "home"
}

fun NavGraphBuilder.homeScreen(
    navController: NavController,
    onOpenConversation: (String) -> Unit,
    onOpenNewChat: () -> Unit,
    onOpenProfile: () -> Unit,
) {
    composable(HomeRoutes.HOME) {
        HomeRoute(
            onOpenConversation = onOpenConversation,
            onOpenNewChat = onOpenNewChat,
            onOpenProfile = onOpenProfile,
        )
    }
}
