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
import androidx.compose.material.icons.filled.Notes
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaListRow
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaTextField
import app.gagachat.core.ui.theme.GagaDimens

/** Create-group screen (Master Spec §C). */
@Composable
fun CreateGroupScreen(
    onCreated: (String) -> Unit,
    onBack: () -> Unit,
    viewModel: CreateGroupViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    GagaScaffold(title = "New group", onBack = onBack) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Column(modifier = Modifier.padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8)) {
                GagaTextField(
                    value = state.name,
                    onValueChange = viewModel::onNameChange,
                    label = "Group name",
                    leadingIcon = Icons.Filled.Groups,
                    imeAction = ImeAction.Next,
                )
                Spacer(Modifier.height(GagaDimens.space12))
                GagaTextField(
                    value = state.description,
                    onValueChange = viewModel::onDescriptionChange,
                    label = "Description (optional)",
                    leadingIcon = Icons.Filled.Notes,
                    singleLine = false,
                    imeAction = ImeAction.Done,
                )
            }

            GagaSectionHeader("Add members (${state.selectedIds.size} selected)")

            LazyColumn(modifier = Modifier.weight(1f)) {
                items(state.friends, key = { it.user.id }) { friend ->
                    GagaListRow(
                        title = friend.user.displayName,
                        subtitle = friend.user.username?.let { "@$it" },
                        avatar = { GagaAvatar(imageUrl = friend.user.avatar, name = friend.user.displayName) },
                        trailing = {
                            Checkbox(
                                checked = state.selectedIds.contains(friend.user.id),
                                onCheckedChange = { viewModel.toggleMember(friend.user.id) },
                            )
                        },
                        onClick = { viewModel.toggleMember(friend.user.id) },
                    )
                }
                if (state.friends.isEmpty()) {
                    item {
                        Text(
                            text = "No friends to add yet. You can add members later.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(GagaDimens.space16),
                        )
                    }
                }
            }

            if (state.error != null) {
                Text(
                    text = state.error!!,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(horizontal = GagaDimens.space16),
                )
            }

            GagaPrimaryButton(
                text = "Create group",
                onClick = { viewModel.create(onCreated) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(GagaDimens.space16),
                loading = state.isCreating,
                enabled = state.name.isNotBlank(),
            )
        }
    }
}
