package app.gagachat.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import app.gagachat.feature.calls.navigation.CallRoutes
import app.gagachat.feature.calls.navigation.activeCallScreen
import app.gagachat.feature.calls.navigation.callHistoryScreen
import app.gagachat.feature.chat.navigation.ChatRoutes
import app.gagachat.feature.chat.navigation.chatScreen
import app.gagachat.feature.groups.GroupsRoutes
import app.gagachat.feature.groups.groupsGraph
import app.gagachat.feature.home.navigation.HomeRoutes
import app.gagachat.feature.home.navigation.homeScreen
import app.gagachat.feature.people.PeopleRoutes
import app.gagachat.feature.people.peopleGraph
import app.gagachat.feature.profile.navigation.ProfileRoutes
import app.gagachat.feature.qr.QrRoutes
import app.gagachat.feature.qr.qrGraph
import app.gagachat.feature.profile.navigation.profileScreen
import app.gagachat.feature.settings.navigation.SettingsRoutes
import app.gagachat.feature.settings.navigation.settingsScreen
import app.gagachat.feature.wallet.WalletRoutes
import app.gagachat.feature.wallet.walletGraph
import app.gagachat.push.PendingDeepLink

private enum class TopLevelDestination(
    val route: String,
    val label: String,
    val icon: ImageVector,
) {
    CHATS(HomeRoutes.HOME, "Chats", Icons.AutoMirrored.Filled.Chat),
    CONTACTS(PeopleRoutes.PEOPLE, "People", Icons.Filled.People),
    CALLS(CallRoutes.CALL_HISTORY, "Calls", Icons.Filled.Call),
    SETTINGS(SettingsRoutes.SETTINGS, "Settings", Icons.Filled.Settings),
}

/**
 * Main graph (PDF §2.1). Hosts the four top-level destinations behind a bottom
 * bar plus the detail surfaces (chat, profile, active call). Deep links captured
 * at cold start are consumed here once the graph is ready (PDF §8).
 */
@Composable
fun MainNavHost(pendingDeepLink: String?) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val showBottomBar = TopLevelDestination.entries.any { it.route == currentRoute }

    LaunchedEffect(pendingDeepLink) {
        if (!pendingDeepLink.isNullOrBlank()) {
            runCatching { navController.navigate(pendingDeepLink) }
            PendingDeepLink.consume()
        }
    }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                GagaBottomBar(navController = navController, currentRoute = currentRoute)
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = HomeRoutes.HOME,
            modifier = Modifier.padding(innerPadding),
        ) {
            homeScreen(
                navController = navController,
                onOpenConversation = { id -> navController.navigate(ChatRoutes.chat(id)) },
                onOpenNewChat = { navController.navigate(PeopleRoutes.PEOPLE) },
                onOpenProfile = { navController.navigate(ProfileRoutes.profile()) },
            )
            chatScreen(
                navController = navController,
                onStartCall = { conversationId, isVideo ->
                    navController.navigate(CallRoutes.activeCall(conversationId, isVideo))
                },
            )
            peopleGraph(
                navController = navController,
                onOpenProfile = { userId -> navController.navigate(ProfileRoutes.profile(userId)) },
                onOpenConversation = { conversationId ->
                    navController.navigate(ChatRoutes.chat(conversationId))
                },
                onOpenGroups = { navController.navigate(GroupsRoutes.GROUPS) },
                onOpenMyQr = { navController.navigate(QrRoutes.MY_QR) },
                onOpenAddByCode = { navController.navigate(QrRoutes.ADD_BY_CODE) },
            )
            groupsGraph(
                navController = navController,
                onOpenConversation = { conversationId ->
                    navController.navigate(ChatRoutes.chat(conversationId))
                },
            )
            qrGraph(
                navController = navController,
                onOpenChat = { conversationId -> navController.navigate(ChatRoutes.chat(conversationId)) },
            )
            callHistoryScreen(
                navController = navController,
                onOpenConversation = { id -> navController.navigate(ChatRoutes.chat(id)) },
            )
            activeCallScreen(
                navController = navController,
                onCallFinished = { /* pop handled inside */ },
            )
            profileScreen(
                navController = navController,
                onStartChat = { userId -> navController.navigate(ProfileRoutes.profile(userId)) },
                onStartCall = { conversationId, isVideo ->
                    navController.navigate(CallRoutes.activeCall(conversationId, isVideo))
                },
            )
            settingsScreen(
                navController = navController,
                onOpenProfile = { navController.navigate(ProfileRoutes.profile()) },
                onOpenWallet = { navController.navigate(WalletRoutes.WALLET) },
                onOpenMyQr = { navController.navigate(QrRoutes.MY_QR) },
                onSignedOut = { /* session flow swaps to auth graph */ },
            )
            walletGraph(navController = navController)
        }
    }
}

@Composable
private fun GagaBottomBar(
    navController: NavHostController,
    currentRoute: String?,
) {
    NavigationBar {
        TopLevelDestination.entries.forEach { destination ->
            NavigationBarItem(
                selected = currentRoute == destination.route,
                onClick = {
                    if (currentRoute != destination.route) {
                        navController.navigate(destination.route) {
                            popUpTo(navController.graph.findStartDestination().id) {
                                saveState = true
                            }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                },
                icon = { Icon(destination.icon, contentDescription = destination.label) },
                label = { Text(destination.label) },
            )
        }
    }
}
