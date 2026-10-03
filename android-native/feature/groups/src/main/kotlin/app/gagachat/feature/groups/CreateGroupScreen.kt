package app.gagachat.feature.groups

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.automirrored.filled.Notes
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaListRow
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaTextButton
import app.gagachat.core.ui.component.GagaTextField
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen

/** Create-group screen (reference screenshot 174353). */
@Composable
fun CreateGroupScreen(
    onCreated: (String) -> Unit,
    onBack: () -> Unit,
    viewModel: CreateGroupViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    val photoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri -> uri?.let(viewModel::onAvatarPicked) }

    GagaScaffold(
        title = "New Group",
        onBack = onBack,
        actions = {
            GagaTextButton(
                text = "Create",
                onClick = { viewModel.create(onCreated) },
                enabled = state.name.isNotBlank() && !state.isCreating,
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            // Photo picker + name / description (reference 174353).
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(72.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .clickable(enabled = !state.isUploadingAvatar) {
                            photoPicker.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                            )
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    when {
                        state.isUploadingAvatar -> CircularProgressIndicator(modifier = Modifier.size(24.dp))
                        state.avatarUrl != null -> GagaAvatar(
                            imageUrl = state.avatarUrl,
                            name = state.name.ifBlank { "Group" },
                            size = 72.dp,
                        )
                        else -> Icon(
                            Icons.Filled.CameraAlt,
                            contentDescription = "Add group photo",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(28.dp),
                        )
                    }
                }
                Spacer(Modifier.width(GagaDimens.space12))
                Column(modifier = Modifier.weight(1f)) {
                    GagaTextField(
                        value = state.name,
                        onValueChange = viewModel::onNameChange,
                        label = "Group Name",
                        leadingIcon = Icons.Filled.Groups,
                        imeAction = ImeAction.Next,
                    )
                    Spacer(Modifier.height(GagaDimens.space8))
                    GagaTextField(
                        value = state.description,
                        onValueChange = viewModel::onDescriptionChange,
                        label = "Description (optional)",
                        leadingIcon = Icons.AutoMirrored.Filled.Notes,
                        singleLine = false,
                        imeAction = ImeAction.Done,
                    )
                }
            }

            // "Add Members" + green "N selected" counter.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Add Members",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = "${state.selectedIds.size} selected",
                    style = MaterialTheme.typography.labelMedium,
                    color = GagaGreen,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            LazyColumn(modifier = Modifier.weight(1f)) {
                items(state.friends, key = { it.user.id }) { friend ->
                    GagaListRow(
                        title = friend.user.displayLabel,
                        subtitle = friend.user.username?.let { "@$it" },
                        avatar = { GagaAvatar(imageUrl = friend.user.avatar, name = friend.user.displayLabel) },
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
        }
    }
}
