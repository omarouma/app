package app.gagachat.feature.groups

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaListRow
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.state.GagaStateHost
import app.gagachat.core.ui.theme.GagaDimens

/** Lists the user's groups (Master Spec §C). */
@Composable
fun GroupsScreen(
    onOpenGroup: (String) -> Unit,
    onCreateGroup: () -> Unit,
    onBack: () -> Unit,
    viewModel: GroupsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    GagaScaffold(
        title = "Groups",
        onBack = onBack,
        floatingActionButton = {
            FloatingActionButton(onClick = onCreateGroup) {
                Icon(Icons.Filled.Add, contentDescription = "Create group")
            }
        },
    ) { padding ->
        GagaStateHost(
            state = state,
            modifier = Modifier.fillMaxSize().padding(padding),
            onRetry = viewModel::refresh,
            emptyIcon = Icons.Filled.Groups,
            emptyTitle = "No groups yet",
            emptyDescription = "Create a group to chat with several people at once.",
            emptyAction = {
                androidx.compose.material3.TextButton(onClick = onCreateGroup) {
                    androidx.compose.material3.Text("Create a group")
                }
            },
        ) { groups ->
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(groups, key = { it.id }) { group ->
                    GagaListRow(
                        title = group.name,
                        subtitle = "${group.memberCount} member" + if (group.memberCount == 1) "" else "s",
                        avatar = { GagaAvatar(imageUrl = group.avatar, name = group.name) },
                        onClick = { onOpenGroup(group.id) },
                    )
                }
            }
        }
    }
}
