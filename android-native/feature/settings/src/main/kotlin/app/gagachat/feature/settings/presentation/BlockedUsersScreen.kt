package app.gagachat.feature.settings.presentation

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaListRow
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.state.GagaStateHost

/** Blocked-users list (Master Spec §C). */
@Composable
fun BlockedUsersScreen(
    onBack: () -> Unit,
    viewModel: BlockedUsersViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    GagaScaffold(title = "Blocked users", onBack = onBack) { padding ->
        GagaStateHost(
            state = state,
            modifier = Modifier.fillMaxSize().padding(padding),
            onRetry = viewModel::refresh,
            emptyIcon = Icons.Filled.Block,
            emptyTitle = "No blocked users",
            emptyDescription = "People you block will appear here.",
        ) { users ->
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(users, key = { it.id }) { user ->
                    GagaListRow(
                        title = user.displayLabel,
                        subtitle = user.username?.let { "@$it" },
                        avatar = { GagaAvatar(imageUrl = user.avatar, name = user.displayLabel) },
                        trailing = {
                            TextButton(onClick = { viewModel.unblock(user.id) }) { Text("Unblock") }
                        },
                    )
                }
            }
        }
    }
}
