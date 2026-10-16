package app.gagachat.feature.contacts.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PersonSearch
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaEmptyState
import app.gagachat.core.ui.component.GagaListRow
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSearchBar
import app.gagachat.core.ui.theme.GagaDimens

@Composable
fun ContactsRoute(
    onNavigateBack: () -> Unit,
    onOpenProfile: (userId: String) -> Unit,
    onOpenConversation: (conversationId: String) -> Unit,
    viewModel: ContactsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var remarkTarget by remember { mutableStateOf<app.gagachat.core.model.User?>(null) }

    GagaScaffold(title = "Contacts", onBack = onNavigateBack) { padding ->
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
            when {
                state.contacts.isNotEmpty() -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = GagaDimens.space48),
                ) {
                    items(items = state.contacts, key = { it.id }) { user ->
                        GagaListRow(
                            title = state.remarks[user.id]?.alias?.takeIf { it.isNotBlank() } ?: user.displayLabel,
                            subtitle = user.displayLabel + " · " +
                                user.status.name.lowercase().replaceFirstChar { it.uppercase() },
                            trailing = {
                                IconButton(onClick = {
                                    viewModel.clearRemarkError()
                                    remarkTarget = user
                                }) {
                                    Icon(Icons.Default.EditNote,
                                        contentDescription = "Set private remark for ${user.displayLabel}")
                                }
                            },
                            avatar = {
                                GagaAvatar(
                                    imageUrl = user.avatar,
                                    name = user.displayLabel,
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

                state.isLoading -> GagaLoading(message = "Searching…")

                state.error != null -> GagaEmptyState(
                    icon = Icons.Filled.PersonSearch,
                    title = "Couldn't load people",
                    description = state.error!!,
                )

                else -> GagaEmptyState(
                    icon = Icons.Filled.PersonSearch,
                    title = if (state.query.isBlank()) "No contacts yet" else "No matches",
                    description = if (state.query.isBlank()) {
                        "People you chat with will appear here."
                    } else {
                        "Try a different name or username."
                    },
                )
            }
        }
    }
    remarkTarget?.let { contact ->
        ContactRemarkDialog(
            contact = contact,
            initial = state.remarks[contact.id] ?: PrivateContactRemark(),
            saving = state.savingRemark,
            error = state.remarkError,
            onDismiss = { if (!state.savingRemark) remarkTarget = null },
            onSave = { alias, mobile, tags, remark ->
                viewModel.saveRemark(contact.id, alias, mobile, tags, remark) {
                    remarkTarget = null
                }
            },
        )
    }
}
