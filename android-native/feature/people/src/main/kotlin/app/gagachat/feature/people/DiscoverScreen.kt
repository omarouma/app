package app.gagachat.feature.people

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.FriendRequest
import app.gagachat.core.model.User
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaEmptyState
import app.gagachat.core.ui.component.GagaListRow
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSearchBar
import app.gagachat.core.ui.component.GagaSecondaryButton
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaTextField
import app.gagachat.core.ui.state.GagaStateHost
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen
import app.gagachat.core.ui.theme.GagaGreenContainer
import kotlinx.coroutines.launch

/**
 * "Add Friends" (reference screenshot 173620). Mirrors the previous web app:
 * a Search / Suggestions / Requests / Nearby tab strip over the QR actions, the
 * shareable "Your Profile Link" card, a directory search and an
 * "Add by QR or Link" paste box.
 */
@Composable
fun DiscoverScreen(
    onOpenProfile: (String) -> Unit,
    onBack: () -> Unit,
    onOpenAddByCode: () -> Unit = {},
    onOpenMyQr: () -> Unit = {},
    viewModel: DiscoverViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var selectedTab by remember { mutableIntStateOf(0) }

    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    fun copy(label: String, value: String, message: String) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboard?.setPrimaryClip(ClipData.newPlainText(label, value))
        scope.launch { snackbarHostState.showSnackbar(message) }
    }

    fun shareLink() {
        val link = state.profileLink.ifBlank { "https://gagachat.app" }
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, "Add me on GaGa Chat: $link")
            putExtra(Intent.EXTRA_SUBJECT, "GaGa Chat")
        }
        context.startActivity(Intent.createChooser(sendIntent, "Share your GaGa profile"))
    }

    val tabs = listOf("Search", "Suggestions", "Requests (${state.incoming.size})", "Nearby")

    GagaScaffold(
        title = "Add Friends",
        onBack = onBack,
        snackbarHostState = snackbarHostState,
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            ScrollableTabRow(selectedTabIndex = selectedTab, edgePadding = GagaDimens.space8) {
                tabs.forEachIndexed { index, label ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(label) },
                    )
                }
            }

            when (selectedTab) {
                0 -> SearchTab(
                    state = state,
                    onQueryChange = viewModel::onQueryChange,
                    onOpenMyQr = onOpenMyQr,
                    onOpenAddByCode = onOpenAddByCode,
                    onShare = ::shareLink,
                    onCopyLink = { copy("GaGa profile", state.profileLink, "Profile link copied") },
                    onOpenProfile = onOpenProfile,
                    onAdd = viewModel::sendRequest,
                )
                1 -> SuggestionsTab(state = state, onOpenProfile = onOpenProfile, onAdd = viewModel::sendRequest)
                2 -> RequestsTab(
                    incoming = state.incoming,
                    onAccept = viewModel::accept,
                    onDecline = viewModel::decline,
                    onOpenProfile = onOpenProfile,
                )
                else -> NearbyTab()
            }
        }
    }
}

@Composable
private fun SearchTab(
    state: DiscoverUiState,
    onQueryChange: (String) -> Unit,
    onOpenMyQr: () -> Unit,
    onOpenAddByCode: () -> Unit,
    onShare: () -> Unit,
    onCopyLink: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onAdd: (User) -> Unit,
) {
    var paste by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize()) {
        // QR action buttons ------------------------------------------------
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space12),
            horizontalArrangement = Arrangement.spacedBy(GagaDimens.space12),
        ) {
            QrAction(Icons.Filled.QrCode2, "My QR", Modifier.weight(1f), onOpenMyQr)
            QrAction(Icons.Filled.QrCodeScanner, "Scan QR", Modifier.weight(1f), onOpenAddByCode)
            QrAction(Icons.Filled.Share, "Share", Modifier.weight(1f), onShare)
        }

        // Your Profile Link ------------------------------------------------
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space16)
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .padding(GagaDimens.space12),
        ) {
            Text(
                text = "Your Profile Link",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(GagaDimens.space4))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = state.profileLink.ifBlank { "https://gagachat.app/profile/…" },
                    style = MaterialTheme.typography.bodyMedium,
                    color = GagaGreen,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onCopyLink) {
                    Icon(
                        Icons.Filled.ContentCopy,
                        contentDescription = "Copy profile link",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        Spacer(Modifier.height(GagaDimens.space12))

        GagaSearchBar(
            query = state.query,
            onQueryChange = onQueryChange,
            placeholder = "Search by username, email, phone, or ID…",
        )

        // Add by QR or Link ------------------------------------------------
        GagaSectionHeader("Add by QR or Link")
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space16),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(GagaDimens.space8),
        ) {
            Box(modifier = Modifier.weight(1f)) {
                GagaTextField(
                    value = paste,
                    onValueChange = { paste = it },
                    label = "Paste GaGa link or user ID",
                    singleLine = true,
                )
            }
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(GagaGreen)
                    .clickable {
                        val token = extractToken(paste)
                        if (token.isNotBlank()) onQueryChange(token)
                    },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.PersonAdd,
                    contentDescription = "Add by link",
                    tint = Color.White,
                )
            }
        }
        Spacer(Modifier.height(GagaDimens.space8))
        GagaSecondaryButton(
            text = "Upload QR Image",
            onClick = onOpenAddByCode,
            leadingIcon = Icons.Filled.Image,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space16),
        )
        Spacer(Modifier.height(GagaDimens.space12))

        // Results ----------------------------------------------------------
        when {
            state.query.trim().length < 2 -> GagaStateHost(
                state = ScreenState.Empty,
                emptyIcon = Icons.Filled.Search,
                emptyTitle = "Search GaGa",
                emptyDescription = "Type at least 2 characters to find people.",
            ) { }

            state.isSearching -> GagaLoading()

            state.error != null -> GagaStateHost(
                state = ScreenState.Error(state.error!!, retryable = true),
                onRetry = { onQueryChange(state.query) },
            ) { }

            state.results.isEmpty() && state.searched -> GagaStateHost(
                state = ScreenState.Empty,
                emptyIcon = Icons.Filled.Search,
                emptyTitle = "No results",
                emptyDescription = "No one matched \"${state.query}\".",
            ) { }

            else -> LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(state.results, key = { it.id }) { user ->
                    DiscoverRow(
                        user = user,
                        isFriend = state.friendIds.contains(user.id),
                        requested = state.sentIds.contains(user.id),
                        onAdd = { onAdd(user) },
                        onClick = { onOpenProfile(user.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SuggestionsTab(
    state: DiscoverUiState,
    onOpenProfile: (String) -> Unit,
    onAdd: (User) -> Unit,
) {
    // No suggestions backend yet: surface the search results as "people to add"
    // when the user has searched, otherwise a friendly empty state.
    if (state.results.isEmpty()) {
        GagaEmptyState(
            icon = Icons.Filled.Star,
            title = "No suggestions yet",
            description = "Search for people you know to add them as friends.",
        )
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(state.results, key = { it.id }) { user ->
            DiscoverRow(
                user = user,
                isFriend = state.friendIds.contains(user.id),
                requested = state.sentIds.contains(user.id),
                onAdd = { onAdd(user) },
                onClick = { onOpenProfile(user.id) },
            )
        }
    }
}

@Composable
private fun RequestsTab(
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
private fun NearbyTab() {
    GagaEmptyState(
        icon = Icons.Filled.Place,
        title = "Nearby people",
        description = "Turn on location sharing to discover people around you.",
    )
}

@Composable
private fun QrAction(
    icon: ImageVector,
    label: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(GagaGreenContainer)
            .clickable(onClick = onClick)
            .padding(vertical = GagaDimens.space12),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, contentDescription = label, tint = GagaGreen, modifier = Modifier.size(24.dp))
        Spacer(Modifier.height(GagaDimens.space4))
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun DiscoverRow(
    user: User,
    isFriend: Boolean,
    requested: Boolean,
    onAdd: () -> Unit,
    onClick: () -> Unit,
) {
    GagaListRow(
        title = user.displayLabel,
        subtitle = user.username?.let { "@$it" } ?: user.bio,
        avatar = { GagaAvatar(imageUrl = user.avatar, name = user.displayLabel) },
        trailing = {
            when {
                isFriend -> Text("Friends", modifier = Modifier.padding(end = GagaDimens.space8))
                requested -> Icon(
                    Icons.Filled.Check,
                    contentDescription = "Requested",
                    modifier = Modifier.padding(end = GagaDimens.space8),
                )
                else -> TextButton(onClick = onAdd) {
                    Icon(Icons.Filled.PersonAdd, contentDescription = null)
                    Text("Add", modifier = Modifier.padding(start = GagaDimens.space4))
                }
            }
        },
        onClick = onClick,
    )
}

/** Extracts a user id or @username from a pasted GaGa link or bare token. */
private fun extractToken(raw: String): String {
    val value = raw.trim()
    if (value.isBlank()) return ""
    // https://gagachat.app/profile/<id>  |  gaga://user/<id>  |  @username  |  <id>
    val afterProfile = value.substringAfterLast("/profile/", "")
    if (afterProfile.isNotBlank()) return afterProfile.trim().trimEnd('/')
    val afterUser = value.substringAfterLast("user/", "")
    if (afterUser.isNotBlank() && afterUser != value) return afterUser.trim().trimEnd('/')
    return value.trimStart('@')
}
