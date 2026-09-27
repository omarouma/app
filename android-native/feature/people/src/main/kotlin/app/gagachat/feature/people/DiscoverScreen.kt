package app.gagachat.feature.people

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.User
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaListRow
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSearchBar
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.state.GagaStateHost
import app.gagachat.core.ui.theme.GagaDimens

/**
 * Discover screen (Master Spec §C): search the directory by name/username and
 * send friend requests. Renders empty/loading/error states inline.
 */
@Composable
fun DiscoverScreen(
    onOpenProfile: (String) -> Unit,
    onBack: () -> Unit,
    onOpenAddByCode: () -> Unit = {},
    viewModel: DiscoverViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    GagaScaffold(
        title = "Find people",
        onBack = onBack,
        actions = {
            IconButton(onClick = onOpenAddByCode) {
                Icon(Icons.Filled.QrCodeScanner, contentDescription = "Add by code")
            }
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            GagaSearchBar(
                query = state.query,
                onQueryChange = viewModel::onQueryChange,
                placeholder = "Search by name or @username",
            )

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
                    onRetry = { viewModel.onQueryChange(state.query) },
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
                            onAdd = { viewModel.sendRequest(user) },
                            onClick = { onOpenProfile(user.id) },
                        )
                    }
                }
            }
        }
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
