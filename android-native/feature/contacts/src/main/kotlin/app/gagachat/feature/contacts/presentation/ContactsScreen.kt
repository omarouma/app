package app.gagachat.feature.contacts.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PersonSearch
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaEmptyState
import app.gagachat.core.ui.component.GagaListRow
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSearchBar
import app.gagachat.core.ui.theme.GagaDimens

@Composable
fun ContactsRoute(
    onOpenProfile: (userId: String) -> Unit,
    onOpenConversation: (conversationId: String) -> Unit,
    viewModel: ContactsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    GagaScaffold(title = "Contacts") { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            GagaSearchBar(
                query = state.query,
                onQueryChange = viewModel::onQueryChange,
                placeholder = "Search people",
            )
            if (state.contacts.isEmpty()) {
                GagaEmptyState(
                    icon = Icons.Filled.PersonSearch,
                    title = if (state.query.isBlank()) "No contacts yet" else "No matches",
                    description = if (state.query.isBlank()) {
                        "People you chat with will appear here."
                    } else {
                        "Try a different name or username."
                    },
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = GagaDimens.space48),
                ) {
                    items(items = state.contacts, key = { it.id }) { user ->
                        GagaListRow(
                            title = user.displayName.ifBlank { user.username ?: "Unknown" },
                            subtitle = user.status.name.lowercase().replaceFirstChar { it.uppercase() },
                            avatar = {
                                GagaAvatar(
                                    imageUrl = user.avatar,
                                    name = user.displayName,
                                    status = user.status,
                                    showStatus = true,
                                )
                            },
                            // Tapping the row opens (or creates) the direct chat,
                            // matching the reference Contacts behaviour.
                            onClick = {
                                viewModel.openChat(user.id) { conversationId ->
                                    onOpenConversation(conversationId)
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}
