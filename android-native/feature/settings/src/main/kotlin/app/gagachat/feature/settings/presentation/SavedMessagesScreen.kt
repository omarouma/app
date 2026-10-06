package app.gagachat.feature.settings.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.saveable.rememberSaveable
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
import app.gagachat.core.ui.component.GagaSearchBar
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
    onOpenChat: (String) -> Unit,
    viewModel: SavedMessagesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var pendingDelete by remember { mutableStateOf<SavedMessage?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val notice by viewModel.notice.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(notice) { notice?.let { snackbar.showSnackbar(it); viewModel.consumeNotice() } }

    GagaScaffold(title = "Saved Messages", onBack = onBack, snackbarHostState = snackbar,
        actions = { IconButton(onClick = { viewModel.refresh() }, enabled = !busy) { Icon(Icons.Filled.Refresh, "Refresh saved messages") } }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
        if (busy) LinearProgressIndicator()
        GagaSearchBar(query, { query = it }, placeholder = "Search saved messages")
        GagaStateHost(
            state = state,
            modifier = Modifier.fillMaxSize(),
            onRetry = viewModel::refresh,
            emptyIcon = Icons.Filled.Bookmark,
            emptyTitle = "No saved messages",
            emptyDescription = "Long-press a message in any chat and choose Save to keep it here.",
        ) { items ->
            val visible = items.filter { it.preview.contains(query, true) }
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                if (visible.isEmpty()) item { Text("No matching saved messages", Modifier.padding(16.dp)) }
                items(visible, key = { it.id }) { saved ->
                    SavedMessageRowItem(
                        saved = saved,
                        onDelete = { pendingDelete = saved },
                        onOpen = { onOpenChat(saved.chatId) },
                    )
                }
            }
        }
        }
    }

    pendingDelete?.let { target ->
        AlertDialog(
            onDismissRequest = { if (!busy) pendingDelete = null },
            title = { Text("Remove saved message?") },
            text = { Text("This only removes it from your saved list.") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.delete(target.id) { pendingDelete = null }
                }, enabled = !busy) { Text(if (busy) "Removing…" else "Remove") }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }, enabled = !busy) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun SavedMessageRowItem(saved: SavedMessage, onDelete: () -> Unit, onOpen: () -> Unit) {
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
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(GagaDimens.iconMedium),
                )
            }
        },
        onClick = onOpen,
        trailing = {
            IconButton(onClick = onDelete) {
                Icon(
                    imageVector = Icons.Outlined.Delete,
                    contentDescription = "Remove saved message",
                    tint = MaterialTheme.colorScheme.error,
                )
            }
        },
    )
}
