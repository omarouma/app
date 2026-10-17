package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.InputChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import app.gagachat.core.model.Message
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.feature.chat.presentation.ForwardDestination
import app.gagachat.feature.chat.presentation.ForwardViewModel
import app.gagachat.feature.chat.presentation.filterForwardDestinations
import app.gagachat.feature.chat.presentation.forwardPreviewLabel

/**
 * F14: "Send to\u2026" selector.
 *
 * Step 1 lets the user search every chat and known contact and pick one or many
 * destinations. Step 2 previews exactly what will be sent and to whom, and only
 * a tap on Send performs the fan-out. Nothing is delivered without an explicit
 * confirmation, and every delivery is idempotent.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ForwardPickerSheet(
    message: Message,
    onDismiss: () -> Unit,
    onForwarded: (Int) -> Unit,
    viewModel: ForwardViewModel = hiltViewModel(),
) {
    val destinations by viewModel.destinations.collectAsStateWithLifecycle()
    val selectedKeys by viewModel.selectedKeys.collectAsStateWithLifecycle()
    val sending by viewModel.sending.collectAsStateWithLifecycle()
    val currentUserId = viewModel.currentUserId
    var query by remember { mutableStateOf("") }
    var previewing by remember { mutableStateOf(false) }

    val filtered = remember(destinations, query) {
        filterForwardDestinations(destinations, query)
    }
    val selectedDestinations = remember(destinations, selectedKeys) {
        destinations.filter { it.key in selectedKeys }
    }

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = { if (!sending) onDismiss() },
        sheetState = sheetState,
    ) {
        if (previewing) {
            ForwardConfirmContent(
                message = message,
                destinations = selectedDestinations,
                sending = sending,
                onBack = { if (!sending) previewing = false },
                onConfirm = { viewModel.send(message) { count -> onForwarded(count) } },
            )
        } else {
            ForwardSelectContent(
                query = query,
                onQueryChange = { query = it },
                destinations = filtered,
                selectedDestinations = selectedDestinations,
                selectedKeys = selectedKeys,
                currentUserId = currentUserId,
                onToggle = viewModel::toggleSelection,
                onPreview = { if (selectedKeys.isNotEmpty()) previewing = true },
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ForwardSelectContent(
    query: String,
    onQueryChange: (String) -> Unit,
    destinations: List<ForwardDestination>,
    selectedDestinations: List<ForwardDestination>,
    selectedKeys: Set<String>,
    currentUserId: String,
    onToggle: (String) -> Unit,
    onPreview: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "Send to\u2026",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = GagaDimens.space20),
        )
        Spacer(Modifier.size(GagaDimens.space12))
        app.gagachat.core.ui.component.GagaSearchBar(
            query = query, onQueryChange = onQueryChange,
            placeholder = "Search chats and contacts",
        )


        if (selectedDestinations.isNotEmpty()) {
            Spacer(Modifier.size(GagaDimens.space8))
            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space20),
                horizontalArrangement = Arrangement.spacedBy(GagaDimens.space8),
                verticalArrangement = Arrangement.spacedBy(GagaDimens.space4),
            ) {
                selectedDestinations.take(3).forEach { destination ->
                    InputChip(
                        selected = true,
                        onClick = { onToggle(destination.key) },
                        label = {
                            Text(
                                text = destination.title,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        },
                    )
                }
            }
        }

        if (selectedDestinations.size > 3) Text("+${selectedDestinations.size - 3} more selected", modifier = Modifier.padding(horizontal = GagaDimens.space20))
        Spacer(Modifier.size(GagaDimens.space8))
        if (destinations.isEmpty()) {
            Text(
                text = if (query.isBlank()) "No chats or contacts yet" else "No matches",
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
                if (query.isBlank()) item(key = "recent-shortcuts") {
                    RecentForwardShortcuts(destinations, selectedKeys, onToggle)
                }
                items(destinations, key = { it.key }) { destination ->
                    ForwardRow(
                        destination = destination,
                        selected = destination.key in selectedKeys,
                        onClick = { onToggle(destination.key) },
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                }
            }
        }

        Spacer(Modifier.size(GagaDimens.space8))
        Button(
            onClick = onPreview,
            enabled = selectedKeys.isNotEmpty(),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space20),
        ) {
            Text(
                if (selectedKeys.isEmpty()) "Select a destination" else
                    "Preview (${selectedKeys.size})",
            )
        }
        Spacer(Modifier.size(GagaDimens.space16))
    }
}

@Composable
private fun RecentForwardShortcuts(destinations: List<ForwardDestination>, selectedKeys: Set<String>, onToggle: (String) -> Unit) {
    Text("Recent chats", modifier = Modifier.padding(horizontal = GagaDimens.space20), style = MaterialTheme.typography.labelLarge)
    LazyRow(Modifier.fillMaxWidth(), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = GagaDimens.space16)) {
        items(destinations.filter { it.conversationId != null }.take(6), key = { "recent-${it.key}" }) { destination ->
            Surface(onClick = { onToggle(destination.key) },
                color = if (destination.key in selectedKeys) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface,
                modifier = Modifier.width(88.dp).padding(4.dp)) {
                Column(Modifier.padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    GagaAvatar(imageUrl = destination.avatarUrl, name = destination.title, size = 44.dp)
                    Text(destination.title, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

@Composable
private fun ForwardConfirmContent(
    message: Message,
    destinations: List<ForwardDestination>,
    sending: Boolean,
    onBack: () -> Unit,
    onConfirm: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space20),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onBack, enabled = !sending) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                Text("Back", modifier = Modifier.padding(start = GagaDimens.space4))
            }
            Spacer(Modifier.weight(1f))
            Text(
                text = "Send to ${destinations.size}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Spacer(Modifier.size(GagaDimens.space8))

        Text(
            text = "Message preview",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = GagaDimens.space20),
        )
        Spacer(Modifier.size(GagaDimens.space4))
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = MaterialTheme.shapes.medium,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space20),
        ) {
            Text(
                text = forwardPreviewLabel(message),
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 4,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(GagaDimens.space12),
            )
        }

        Spacer(Modifier.size(GagaDimens.space12))
        Text(
            text = "Recipients",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = GagaDimens.space20),
        )
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 300.dp),
        ) {
            items(destinations, key = { it.key }) { destination ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = GagaDimens.space20, vertical = GagaDimens.space8),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(GagaDimens.space12),
                ) {
                    DestinationAvatar(destination)
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = destination.title,
                            style = MaterialTheme.typography.bodyLarge,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = if (destination.isGroup) "Group" else "Direct chat",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        Spacer(Modifier.size(GagaDimens.space12))
        Button(
            onClick = onConfirm,
            enabled = !sending && destinations.isNotEmpty(),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space20),
        ) {
            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null)
            Text(
                text = if (sending) "Sending\u2026" else "Send to ${destinations.size}",
                modifier = Modifier.padding(start = GagaDimens.space8),
            )
        }
        Spacer(Modifier.size(GagaDimens.space16))
    }
}

@Composable
private fun ForwardRow(
    destination: ForwardDestination,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = GagaDimens.space20, vertical = GagaDimens.space12),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Start,
    ) {
        DestinationAvatar(destination)
        Spacer(Modifier.width(GagaDimens.space12))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = destination.title,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            destination.subtitle?.let { subtitle ->
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Checkbox(checked = selected, onCheckedChange = { onClick() })
    }
}

@Composable
private fun DestinationAvatar(destination: ForwardDestination) {
    if (destination.avatarUrl.isNullOrBlank()) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(androidx.compose.foundation.shape.CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (destination.isGroup) Icons.Filled.Group else Icons.Filled.Person,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    } else {
        GagaAvatar(
            imageUrl = destination.avatarUrl,
            name = destination.title,
            size = 44.dp,
        )
    }
}
