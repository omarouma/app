package app.gagachat.navigation

import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.gagachat.core.ui.theme.GagaDimens
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import app.gagachat.feature.calls.navigation.CallRoutes
import app.gagachat.feature.calls.navigation.activeCallScreen
import app.gagachat.feature.calls.navigation.callHistoryScreen
import app.gagachat.feature.chat.navigation.ChatRoutes
import app.gagachat.feature.chat.navigation.chatInfoScreen
import app.gagachat.feature.chat.navigation.chatScreen
import app.gagachat.feature.contacts.navigation.ContactsRoutes
import app.gagachat.feature.contacts.navigation.contactsScreen
import app.gagachat.feature.groups.GroupsRoutes
import app.gagachat.feature.groups.groupsGraph
import app.gagachat.feature.home.navigation.HomeRoutes
import app.gagachat.feature.home.navigation.homeScreen
import app.gagachat.feature.home.navigation.moreScreen
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

/**
 * The four top-level tabs, in the final product order:
 * Chats / People / Calls / Profile. [route] is the concrete navigation target;
 * [routePattern] is the registered pattern used to detect selection (the Profile
 * route carries an optional argument so its pattern differs from its target).
 */
private enum class TopLevelDestination(
    val route: String,
    val routePattern: String,
    val label: String,
    val icon: ImageVector,
) {
    CHAT(HomeRoutes.HOME, HomeRoutes.HOME, "Chats", Icons.AutoMirrored.Filled.Chat),
    PEOPLE(PeopleRoutes.PEOPLE, PeopleRoutes.PEOPLE, "People", Icons.Filled.People),
    CALLS(CallRoutes.CALL_HISTORY, CallRoutes.CALL_HISTORY, "Calls", Icons.Filled.Call),
    PROFILE(ProfileRoutes.profile(), ProfileRoutes.PROFILE, "Profile", Icons.Filled.Person),
}

/** Routes that keep the bottom bar visible (top-level tabs + the More menu). */
private val bottomBarRoutes: Set<String> = TopLevelDestination.entries
    .map { it.routePattern }
    .toSet() + HomeRoutes.MORE

/**
 * Main graph (PDF §2.1). Hosts the four top-level destinations behind a bottom
 * bar plus the detail surfaces (chat, profile, active call, More menu). Deep
 * links captured at cold start are consumed here once the graph is ready (§8).
 */
@Composable
fun MainNavHost(pendingDeepLink: String?) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val showBottomBar = currentRoute in bottomBarRoutes
    val viewModel: MainNavViewModel = hiltViewModel()
    val totalUnread by viewModel.totalUnread.collectAsStateWithLifecycle()

    LaunchedEffect(pendingDeepLink) {
        if (!pendingDeepLink.isNullOrBlank()) {
            runCatching { navController.navigate(pendingDeepLink) }
            PendingDeepLink.consume()
        }
    }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                GagaBottomBar(
                    navController = navController,
                    currentRoute = currentRoute,
                    chatBadgeCount = totalUnread,
                )
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = HomeRoutes.HOME,
            // F02: the outer Scaffold already reserves the status-bar and
            // navigation-bar space via `innerPadding`. Consume those insets so
            // each destination's own TopAppBar/Scaffold does NOT apply the
            // status-bar inset a second time (which produced the excessive empty
            // space above every header). Keyboard (IME) insets are intentionally
            // left untouched for the chat composer to handle.
            modifier = Modifier
                .padding(innerPadding)
                .consumeWindowInsets(innerPadding),
        ) {
            homeScreen(
                navController = navController,
                onOpenConversation = { id -> navController.navigate(ChatRoutes.chat(id)) },
                onOpenNewChat = { navController.navigate(PeopleRoutes.PEOPLE) },
                onOpenNotifications = { navController.navigate(SettingsRoutes.NOTIFICATIONS_INBOX) },
            )
            moreScreen(
                navController = navController,
                onOpenProfile = { navController.navigate(ProfileRoutes.profile()) },
                onOpenConversations = { navController.navigate(HomeRoutes.HOME) },
                onOpenCalls = { navController.navigate(CallRoutes.CALL_HISTORY) },
                onOpenContacts = { navController.navigate(ContactsRoutes.CONTACTS) },
                onOpenAddFriends = { navController.navigate(PeopleRoutes.DISCOVER) },
                onOpenPeople = { navController.navigate(PeopleRoutes.PEOPLE) },
                onOpenWallet = { navController.navigate(WalletRoutes.WALLET) },
                onOpenMyQr = { navController.navigate(QrRoutes.MY_QR) },
                onOpenBlocked = { navController.navigate(SettingsRoutes.BLOCKED) },
                onOpenSettings = { navController.navigate(SettingsRoutes.SETTINGS) },
                onOpenNotifications = { navController.navigate(SettingsRoutes.NOTIFICATIONS) },
                onOpenPrivacy = { navController.navigate(SettingsRoutes.PRIVACY) },
                onOpenSearch = { navController.navigate(PeopleRoutes.DISCOVER) },
                onOpenHelp = { navController.navigate(SettingsRoutes.ABOUT) },
                onBack = { navController.popBackStack() },
            )
            chatScreen(
                navController = navController,
                onStartCall = { conversationId, isVideo ->
                    navController.navigate(CallRoutes.activeCall(conversationId, isVideo))
                },
                onOpenProfile = { userId ->
                    navController.navigate(ProfileRoutes.profile(userId))
                },
                onSendMoney = { navController.navigate(WalletRoutes.WALLET) },
            )
            chatInfoScreen(
                navController = navController,
                onStartCall = { conversationId, isVideo ->
                    navController.navigate(CallRoutes.activeCall(conversationId, isVideo))
                },
                onOpenProfile = { userId ->
                    navController.navigate(ProfileRoutes.profile(userId))
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
            contactsScreen(
                navController = navController,
                onOpenProfile = { userId -> navController.navigate(ProfileRoutes.profile(userId)) },
                onOpenConversation = { conversationId ->
                    navController.navigate(ChatRoutes.chat(conversationId))
                },
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
                onStartCall = { conversationId, isVideo ->
                    navController.navigate(CallRoutes.activeCall(conversationId, isVideo))
                },
            )
            activeCallScreen(
                navController = navController,
                onCallFinished = { /* pop handled inside */ },
            )
            profileScreen(
                navController = navController,
                onOpenConversation = { conversationId ->
                    navController.navigate(ChatRoutes.chat(conversationId))
                },
                onStartCall = { conversationId, isVideo ->
                    navController.navigate(CallRoutes.activeCall(conversationId, isVideo))
                },
                onEditProfile = { navController.navigate(SettingsRoutes.EDIT_PROFILE) },
                onOpenPrivacy = { navController.navigate(SettingsRoutes.PRIVACY) },
                onOpenMore = { navController.navigate(HomeRoutes.MORE) },
                onOpenMyQr = { navController.navigate(QrRoutes.MY_QR) },
                onOpenSavedMessages = { navController.navigate(SettingsRoutes.SAVED_MESSAGES) },
                onOpenWallet = { navController.navigate(WalletRoutes.WALLET) },
                onOpenSettings = { navController.navigate(SettingsRoutes.SETTINGS) },
                onOpenBlocked = { navController.navigate(SettingsRoutes.BLOCKED) },
                onOpenLanguage = { navController.navigate(SettingsRoutes.LANGUAGE) },
                onOpenStorage = { navController.navigate(SettingsRoutes.STORAGE) },
                onOpenHelp = { navController.navigate(SettingsRoutes.ABOUT) },
                onOpenAbout = { navController.navigate(SettingsRoutes.ABOUT) },
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

/**
 * The app-wide bottom navigation. A hairline divider separates it from content,
 * the selected tab gets a soft green pill indicator with a bold label, and the
 * Chats tab carries a live unread badge so the user never misses a message.
 */
@Composable
private fun GagaBottomBar(
    navController: NavHostController,
    currentRoute: String?,
    chatBadgeCount: Int,
) {
    Column {
        HorizontalDivider(
            thickness = GagaDimens.hairline,
            color = MaterialTheme.colorScheme.outlineVariant,
        )
        NavigationBar(
            containerColor = MaterialTheme.colorScheme.surface,
            tonalElevation = 0.dp,
        ) {
            TopLevelDestination.entries.forEach { destination ->
                val selected = currentRoute == destination.routePattern
                NavigationBarItem(
                    selected = selected,
                    onClick = {
                        if (currentRoute != destination.routePattern) {
                            navController.navigate(destination.route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    },
                    icon = {
                        if (destination == TopLevelDestination.CHAT && chatBadgeCount > 0) {
                            BadgedBox(
                                badge = {
                                    Badge(
                                        containerColor = MaterialTheme.colorScheme.primary,
                                        contentColor = MaterialTheme.colorScheme.onPrimary,
                                    ) {
                                        Text(if (chatBadgeCount > 99) "99+" else "$chatBadgeCount")
                                    }
                                },
                            ) {
                                Icon(destination.icon, contentDescription = destination.label)
                            }
                        } else {
                            Icon(destination.icon, contentDescription = destination.label)
                        }
                    },
                    label = {
                        Text(
                            text = destination.label,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                        )
                    },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                )
            }
        }
    }
}
