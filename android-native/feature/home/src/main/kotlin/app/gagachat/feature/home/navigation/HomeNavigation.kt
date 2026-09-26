package app.gagachat.feature.home.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import app.gagachat.feature.home.presentation.HomeRoute
import app.gagachat.feature.home.presentation.MoreRoute

object HomeRoutes {
    const val HOME = "home"
    const val MORE = "more"
}

fun NavGraphBuilder.homeScreen(
    navController: NavController,
    onOpenConversation: (String) -> Unit,
    onOpenNewChat: () -> Unit,
    onOpenMore: () -> Unit,
) {
    composable(HomeRoutes.HOME) {
        HomeRoute(
            onOpenConversation = onOpenConversation,
            onOpenNewChat = onOpenNewChat,
            onOpenMore = onOpenMore,
        )
    }
}

/**
 * Registers the "More" menu (reference screenshots 174121 / 174131 / 174138).
 * All destinations are owned by their own feature graphs and reached through
 * callbacks so those routes keep a single source of truth.
 */
fun NavGraphBuilder.moreScreen(
    navController: NavController,
    onOpenProfile: () -> Unit,
    onOpenConversations: () -> Unit,
    onOpenCalls: () -> Unit,
    onOpenContacts: () -> Unit,
    onOpenAddFriends: () -> Unit,
    onOpenPeople: () -> Unit,
    onOpenWallet: () -> Unit,
    onOpenMyQr: () -> Unit,
    onOpenBlocked: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenHelp: () -> Unit,
) {
    composable(HomeRoutes.MORE) {
        MoreRoute(
            onOpenProfile = onOpenProfile,
            onOpenConversations = onOpenConversations,
            onOpenCalls = onOpenCalls,
            onOpenContacts = onOpenContacts,
            onOpenAddFriends = onOpenAddFriends,
            onOpenPeople = onOpenPeople,
            onOpenWallet = onOpenWallet,
            onOpenMyQr = onOpenMyQr,
            onOpenBlocked = onOpenBlocked,
            onOpenSettings = onOpenSettings,
            onOpenNotifications = onOpenNotifications,
            onOpenPrivacy = onOpenPrivacy,
            onOpenSearch = onOpenSearch,
            onOpenHelp = onOpenHelp,
        )
    }
}
