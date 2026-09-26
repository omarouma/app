package app.gagachat.feature.groups

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.Group
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaListRow
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSecondaryButton
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.state.GagaStateHost
import app.gagachat.core.ui.theme.GagaDimens

/** Group detail screen (Master Spec §C): members, add/remove, leave/delete. */
@Composable
fun GroupInfoScreen(
    onLeft: () -> Unit,
    onBack: () -> Unit,
    viewModel: GroupInfoViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val friends by viewModel.friends.collectAsStateWithLifecycle()
    val me = viewModel.currentUserId

    GagaScaffold(title = "Group info", onBack = onBack) { padding ->
        GagaStateHost(
            state = state,
            modifier = Modifier.fillMaxSize().padding(padding),
            onRetry = viewModel::refresh,
        ) { group ->
            val isAdmin = group.members.firstOrNull { it.userId == me }?.isAdmin == true
            val memberIds = group.members.map { it.userId }.toSet()
            val addable = friends.filter { !memberIds.contains(it.user.id) }

            LazyColumn(modifier = Modifier.fillMaxSize()) {
                item { GroupHeader(group) }
                item { GagaSectionHeader("Members (${group.memberCount})") }
                items(group.members, key = { it.id }) { member ->
                    GagaListRow(
                        title = member.displayName ?: if (member.userId == me) "You" else "Member",
                        subtitle = member.role.name.lowercase().replaceFirstChar { it.uppercase() },
                        avatar = { GagaAvatar(imageUrl = member.avatar, name = member.displayName) },
                        trailing = {
                            if (isAdmin && member.userId != me) {
                                IconButton(onClick = { viewModel.removeMember(member.userId) }) {
                                    Icon(
                                        Icons.Filled.PersonRemove,
                                        contentDescription = "Remove member",
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        },
                    )
                }

                if (addable.isNotEmpty()) {
                    item { GagaSectionHeader("Add members") }
                    items(addable, key = { it.user.id }) { friend ->
                        GagaListRow(
                            title = friend.user.displayLabel,
                            subtitle = friend.user.username?.let { "@$it" },
                            avatar = { GagaAvatar(imageUrl = friend.user.avatar, name = friend.user.displayLabel) },
                            trailing = {
                                IconButton(onClick = { viewModel.addMembers(listOf(friend.user.id)) }) {
                                    Icon(
                                        Icons.Filled.PersonAdd,
                                        contentDescription = "Add member",
                                        tint = MaterialTheme.colorScheme.primary,
                                    )
                                }
                            },
                        )
                    }
                }

                item {
                    Spacer(Modifier.height(GagaDimens.space16))
                    GagaSecondaryButton(
                        text = "Leave group",
                        onClick = { viewModel.leave(onLeft) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = GagaDimens.space16),
                    )
                    Spacer(Modifier.height(GagaDimens.space24))
                }
            }
        }
    }
}

@Composable
private fun GroupHeader(group: Group) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(GagaDimens.space24),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        GagaAvatar(imageUrl = group.avatar, name = group.name, size = 96.dp)
        Spacer(Modifier.height(GagaDimens.space12))
        Text(text = group.name, style = MaterialTheme.typography.titleLarge)
        if (!group.description.isNullOrBlank()) {
            Spacer(Modifier.height(GagaDimens.space4))
            Text(
                text = group.description!!,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
