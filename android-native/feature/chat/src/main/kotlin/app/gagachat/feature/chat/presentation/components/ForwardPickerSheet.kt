package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.Conversation
import app.gagachat.core.model.ConversationType
import app.gagachat.core.model.Message
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.feature.chat.presentation.ForwardViewModel

/**
 * F14: bottom sheet that lets the user choose which conversation to forward a
 * message into. Shows every chat (with a search box) and forwards on tap.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ForwardPickerSheet(
    message: Message,
    onDismiss: () -> Unit,
    onForwarded: (Conversation) -> Unit,
    viewModel: ForwardViewModel = hiltViewModel(),
) {
    val conversations by viewModel.conversations.collectAsStateWithLifecycle()
    val currentUserId = viewModel.currentUserId
    var query by remember { mutableStateOf("") }

    val filtered = remember(conversations, query, currentUserId) {
        if (query.isBlank()) {
            conversations
        } else {
            conversations.filter { it.displayTitle(currentUserId).contains(query, ignoreCase = true) }
        }
    }

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = "Forward to\u2026",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = GagaDimens.space20),
            )
            Spacer(Modifier.size(GagaDimens.space12))
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                placeholder = { Text("Search chats") },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space20),
            )
            Spacer(Modifier.size(GagaDimens.space8))
            if (filtered.isEmpty()) {
                Text(
                    text = "No chats found",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(GagaDimens.space20),
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 420.dp),
                ) {
                    items(filtered, key = { it.id }) { conversation ->
                        ForwardRow(
                            conversation = conversation,
                            currentUserId = currentUserId,
                            onClick = {
                                viewModel.forward(message, conversation.id) {
                                    onForwarded(conversation)
                                }
                            },
                        )
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                    }
                }
            }
            Spacer(Modifier.size(GagaDimens.space8))
        }
    }
}

@Composable
private fun ForwardRow(
    conversation: Conversation,
    currentUserId: String,
    onClick: () -> Unit,
) {
    val isGroup = conversation.type != ConversationType.DIRECT
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = GagaDimens.space20, vertical = GagaDimens.space12),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Start,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (isGroup) Icons.Filled.Group else Icons.Filled.Person,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(GagaDimens.space12))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = conversation.displayTitle(currentUserId),
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            conversation.lastMessagePreview?.takeIf { it.isNotBlank() }?.let { preview ->
                Text(
                    text = preview,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
