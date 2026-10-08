package app.gagachat.feature.people

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.Friend
import app.gagachat.core.model.FriendRequest
import app.gagachat.core.model.User
import app.gagachat.core.model.UserStatus
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaEmptyState
import app.gagachat.core.ui.component.GagaListRow
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSearchBar
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.state.GagaStateHost
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.theme.GagaDimens

/**
 * People screen (Master Spec §C). Mirrors the reference Contacts screen
 * (screenshot 173615): Friends / Favorites / Requests / Sent / Blocked tabs over
 * a searchable list. Every state (loading/empty/offline/error) is rendered
 * through [GagaStateHost].
 */
@Composable
fun PeopleScreen(
    onOpenProfile: (String) -> Unit,
    onOpenConversation: (String) -> Unit,
    onOpenDiscover: () -> Unit,
    onOpenGroups: () -> Unit = {},
    onOpenMyQr: () -> Unit = {},
    viewModel: PeopleViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }
    val favoriteIds by viewModel.favoriteIds.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val notice by viewModel.notice.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var pendingRemove by remember { mutableStateOf<Friend?>(null) }
    var topMenu by remember { mutableStateOf(false) }
    LaunchedEffect(notice) { notice?.let { snackbar.showSnackbar(it); viewModel.consumeNotice() } }

    val tabs = listOf("Friends", "Favorites", "Requests", "Sent", "Blocked")

    GagaScaffold(
        title = "People",
        snackbarHostState = snackbar,
        actions = {
            IconButton(onClick = onOpenDiscover) {
                Icon(Icons.Filled.PersonAdd, contentDescription = "Add people")
            }
            Box {
                IconButton(onClick = { topMenu = true }) { Icon(Icons.Filled.MoreVert, "People options") }
                DropdownMenu(topMenu, { topMenu = false }) {
                    DropdownMenuItem(text = { Text("My QR code") }, onClick = { topMenu = false; onOpenMyQr() })
                    DropdownMenuItem(text = { Text("Groups") }, onClick = { topMenu = false; onOpenGroups() })
                    DropdownMenuItem(text = { Text("Refresh people") }, onClick = { topMenu = false; viewModel.refresh() }, enabled = !busy)
                }
            }
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (busy) LinearProgressIndicator()
            ScrollableTabRow(selectedTabIndex = selectedTab, edgePadding = GagaDimens.space8) {
                tabs.forEachIndexed { index, label ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(label) },
                    )
                }
            }

            GagaStateHost(
                state = state,
                onRetry = viewModel::refresh,
                emptyIcon = Icons.Filled.PersonAdd,
                emptyTitle = "No friends yet",
                emptyDescription = "Find people you know and start chatting.",
                emptyAction = {
                    TextButton(onClick = onOpenDiscover) { Text("Find people") }
                },
                modifier = Modifier.fillMaxSize(),
            ) { data ->
                when (selectedTab) {
                    0 -> FriendsTab(
                        friends = data.friends,
                        query = query,
                        onQueryChange = viewModel::onQueryChange,
                        onOpenProfile = onOpenProfile,
                        onOpenChat = { userId -> viewModel.openChat(userId, onOpenConversation) },
                        onRemove = { pendingRemove = it },
                        favorites = favoriteIds,
                        onFavorite = viewModel::favorite,
                    )
                    1 -> FavoritesTab(
                        friends = data.friends.filter { it.user.id in favoriteIds },
                        onOpenProfile = onOpenProfile,
                        onOpenChat = { userId -> viewModel.openChat(userId, onOpenConversation) },
                        onUnfavorite = { viewModel.favorite(it, false) },
                    )
                    2 -> IncomingTab(
                        incoming = data.incoming,
                        onAccept = viewModel::accept,
                        onDecline = viewModel::decline,
                        onOpenProfile = onOpenProfile,
                    )
                    3 -> SentTab(
                        outgoing = data.outgoing,
                        onCancel = viewModel::cancel,
                        onOpenProfile = onOpenProfile,
                    )
                    else -> BlockedTab(
                        blocked = data.blocked,
                        onUnblock = viewModel::unblock,
                        onOpenProfile = onOpenProfile,
                    )
                }
            }
        }
    }
    pendingRemove?.let { friend ->
        AlertDialog(onDismissRequest = { pendingRemove = null }, title = { Text("Remove friend?") },
            text = { Text("Remove ${friend.user.displayLabel} from your friends? Existing messages are kept.") },
            confirmButton = { TextButton(onClick = { viewModel.removeFriend(friend); pendingRemove = null }, enabled = !busy) { Text("Remove") } },
            dismissButton = { TextButton(onClick = { pendingRemove = null }) { Text("Cancel") } })
    }
}

@Composable
private fun FriendsTab(
    friends: List<Friend>,
    query: String,
    onQueryChange: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenChat: (String) -> Unit,
    onRemove: (Friend) -> Unit,
    favorites: Set<String>,
    onFavorite: (String, Boolean) -> Unit,
) {
    val filtered = remember(friends, query) {
        if (query.isBlank()) friends
        else friends.filter {
            it.user.displayLabel.contains(query, ignoreCase = true) ||
                it.user.username?.contains(query, ignoreCase = true) == true
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        GagaSearchBar(query = query, onQueryChange = onQueryChange, placeholder = "Search friends")
        if (filtered.isEmpty()) {
            GagaEmptyState(
                icon = Icons.Filled.PersonAdd,
                title = if (query.isBlank()) "No friends yet" else "No matches",
                description = if (query.isBlank()) {
                    "Add people to start chatting."
                } else {
                    "Try a different name or username."
                },
            )
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(filtered, key = { it.user.id }) { friend ->
                    var menu by remember { mutableStateOf(false) }
                    GagaListRow(
                        title = friend.user.displayLabel,
                        subtitle = friend.user.username?.let { "@$it" }
                            ?: if (friend.isOnline) "Online" else "Offline",
                        avatar = {
                            GagaAvatar(
                                imageUrl = friend.user.avatar,
                                name = friend.user.displayLabel,
                                status = if (friend.isOnline) UserStatus.ONLINE else UserStatus.OFFLINE,
                                showStatus = true,
                            )
                        },
                        trailing = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                IconButton(onClick = { onOpenChat(friend.user.id) }) {
                                    Icon(
                                        Icons.AutoMirrored.Filled.Chat,
                                        contentDescription = "Chat",
                                        tint = MaterialTheme.colorScheme.primary,
                                    )
                                }
                                Box {
                                    IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "Friend options") }
                                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                        val favorite = friend.user.id in favorites
                                        DropdownMenuItem(text = { Text(if (favorite) "Remove favorite" else "Add to favorites") },
                                            leadingIcon = { Icon(if (favorite) Icons.Filled.Star else Icons.Filled.StarBorder, null) },
                                            onClick = { menu = false; onFavorite(friend.user.id, !favorite) })
                                        DropdownMenuItem(text = { Text("Remove friend") }, onClick = { menu = false; onRemove(friend) })
                                    }
                                }
                            }
                        },
                        onClick = { onOpenProfile(friend.user.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun FavoritesTab(
    friends: List<Friend>,
    onOpenProfile: (String) -> Unit,
    onOpenChat: (String) -> Unit,
    onUnfavorite: (String) -> Unit,
) {
    if (friends.isEmpty()) {
        GagaEmptyState(
            icon = Icons.Filled.Star,
            title = "No favorites yet",
            description = "Open a friend's options and choose Add to favorites. Favorites are saved for this account on this device.",
        )
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(friends, key = { it.user.id }) { friend ->
            GagaListRow(
                title = friend.user.displayLabel,
                subtitle = friend.user.username?.let { "@$it" } ?: "Friend",
                avatar = {
                    GagaAvatar(imageUrl = friend.user.avatar, name = friend.user.displayLabel)
                },
                trailing = {
                    Row {
                    IconButton(onClick = { onUnfavorite(friend.user.id) }) { Icon(Icons.Filled.Star, "Remove favorite", tint = MaterialTheme.colorScheme.primary) }
                    IconButton(onClick = { onOpenChat(friend.user.id) }) {
                        Icon(
                            Icons.AutoMirrored.Filled.Chat,
                            contentDescription = "Chat",
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                    }
                },
                onClick = { onOpenProfile(friend.user.id) },
            )
        }
    }
}

@Composable
private fun IncomingTab(
    incoming: List<FriendRequest>,
    onAccept: (FriendRequest) -> Unit,
    onDecline: (FriendRequest) -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    if (incoming.isEmpty()) {
        GagaEmptyState(
            icon = Icons.Filled.PersonAdd,
            title = "No friend requests",
            description = "Requests people send you appear here.",
        )
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item { GagaSectionHeader("Received") }
        items(incoming, key = { it.id }) { request ->
            GagaListRow(
                title = request.fromName ?: "Someone",
                subtitle = request.message ?: "wants to be your friend",
                avatar = { GagaAvatar(imageUrl = request.fromAvatar, name = request.fromName) },
                trailing = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = { onAccept(request) }) { Text("Accept") }
                        TextButton(onClick = { onDecline(request) }) { Text("Decline") }
                    }
                },
                onClick = { onOpenProfile(request.fromUserId) },
            )
        }
    }
}

@Composable
private fun SentTab(
    outgoing: List<FriendRequest>,
    onCancel: (FriendRequest) -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    if (outgoing.isEmpty()) {
        GagaEmptyState(
            icon = Icons.Filled.PersonAdd,
            title = "No sent requests",
            description = "Friend requests you send appear here.",
        )
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item { GagaSectionHeader("Sent") }
        items(outgoing, key = { it.id }) { request ->
            GagaListRow(
                title = request.toName ?: "Pending",
                subtitle = "Request pending",
                avatar = { GagaAvatar(imageUrl = request.toAvatar, name = request.toName) },
                trailing = {
                    TextButton(onClick = { onCancel(request) }) { Text("Cancel") }
                },
                onClick = { onOpenProfile(request.toUserId) },
            )
        }
    }
}

@Composable
private fun BlockedTab(
    blocked: List<User>,
    onUnblock: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    if (blocked.isEmpty()) {
        GagaEmptyState(
            icon = Icons.Filled.Block,
            title = "No blocked users",
            description = "People you block will be listed here.",
        )
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item { GagaSectionHeader("Blocked") }
        items(blocked, key = { it.id }) { user ->
            GagaListRow(
                title = user.displayLabel,
                subtitle = user.username?.let { "@$it" } ?: "Blocked",
                avatar = { GagaAvatar(imageUrl = user.avatar, name = user.displayLabel) },
                trailing = {
                    TextButton(onClick = { onUnblock(user.id) }) { Text("Unblock") }
                },
                onClick = { onOpenProfile(user.id) },
            )
        }
    }
}
