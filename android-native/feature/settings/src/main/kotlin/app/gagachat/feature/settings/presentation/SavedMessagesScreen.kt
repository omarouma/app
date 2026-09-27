package app.gagachat.feature.settings.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.SavedMessage
import app.gagachat.core.ui.component.GagaListRow
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.state.GagaStateHost
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen
import app.gagachat.core.ui.theme.GagaGreenContainer
import app.gagachat.core.ui.util.TimeFormat

/**
 * Saved Messages (Master Spec §C — Profile hub). Lists the signed-in user's
 * bookmarked messages from the LIVE `saved_messages` table with a per-row
 * delete action.
 */
@Composable
fun SavedMessagesScreen(
    onBack: () -> Unit,
    viewModel: SavedMessagesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var pendingDelete by remember { mutableStateOf<SavedMessage?>(null) }

    GagaScaffold(title = "Saved Messages", onBack = onBack) { padding ->
        GagaStateHost(
            state = state,
            modifier = Modifier.fillMaxSize().padding(padding),
            onRetry = viewModel::refresh,
            emptyIcon = Icons.Filled.Bookmark,
            emptyTitle = "No saved messages",
            emptyDescription = "Long-press a message in any chat and choose Save to keep it here.",
        ) { items ->
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(items, key = { it.id }) { saved ->
                    SavedMessageRowItem(
                        saved = saved,
                        onDelete = { pendingDelete = saved },
                    )
                }
            }
        }
    }

    pendingDelete?.let { target ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Remove saved message?") },
            text = { Text("This only removes it from your saved list.") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.delete(target.id)
                    pendingDelete = null
                }) { Text("Remove") }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun SavedMessageRowItem(saved: SavedMessage, onDelete: () -> Unit) {
    GagaListRow(
        title = saved.preview,
        subtitle = if (saved.savedAt > 0L) {
            "Saved ${TimeFormat.conversationTime(saved.savedAt)}"
        } else {
            null
        },
        avatar = {
            Box(
                modifier = Modifier
                    .size(GagaDimens.avatarMedium)
                    .clip(CircleShape)
                    .background(GagaGreenContainer),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.Bookmark,
                    contentDescription = null,
                    tint = GagaGreen,
                    modifier = Modifier.size(GagaDimens.iconMedium),
                )
            }
        },
        trailing = {
            IconButton(onClick = onDelete) {
                Icon(
                    imageVector = Icons.Outlined.Delete,
                    contentDescription = "Remove saved message",
                    tint = GagaGreen,
                )
            }
        },
    )
}
