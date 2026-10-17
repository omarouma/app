package app.gagachat.feature.chat.presentation.components

import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageType
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaSearchBar
import app.gagachat.feature.chat.presentation.AttachmentBrowserViewModel
import app.gagachat.feature.chat.presentation.contactSections
import app.gagachat.feature.chat.presentation.reusableAttachments
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AttachmentBrowserSheet(
    messages: List<Message>, onDismiss: () -> Unit, onPhoneFile: () -> Unit,
    onGallery: () -> Unit, onSend: (Message) -> Unit,
    viewModel: AttachmentBrowserViewModel = hiltViewModel(),
) {
    val favorites by viewModel.favorites.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val loading by viewModel.loading.collectAsStateWithLifecycle()
    var tab by remember { mutableIntStateOf(0) }
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<Message?>(null) }
    val chat = remember(messages) { reusableAttachments(messages) }
    val saved = remember(favorites) { favorites.filter { it.type in listOf("file", "document", "audio", "image", "photo", "video") && !it.mediaUrl.isNullOrBlank() }.map {
        Message(localId = "saved-${it.id}", clientMessageId = it.messageId, serverMessageId = it.messageId,
            conversationId = it.chatId, senderId = it.senderId.orEmpty(), text = it.content,
            mediaUrl = it.mediaUrl, type = when (it.type) { "audio" -> MessageType.AUDIO; "image", "photo" -> MessageType.IMAGE; "video" -> MessageType.VIDEO; else -> MessageType.FILE })
    } }
    val rows = (if (tab == 1) saved else chat).filter { query.isBlank() || it.text.orEmpty().contains(query, true) }
    // A refresh/remove/account switch must invalidate a now-unavailable selection.
    LaunchedEffect(rows) { if (rows.none { it.localId == selected?.localId }) selected = null }
    LaunchedEffect(Unit) { viewModel.refresh() }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().heightIn(max = 620.dp).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Select file", style = MaterialTheme.typography.titleLarge)
            ScrollableTabRow(selectedTabIndex = tab, edgePadding = 0.dp) {
                listOf("Chat", "Favorites", "Gallery", "Phone files").forEachIndexed { index, title ->
                    Tab(selected = tab == index, onClick = { tab = index; selected = null }, text = { Text(title) })
                }
            }
            if (tab < 2) {
                GagaSearchBar(query = query, onQueryChange = { query = it }, placeholder = "Search files")
                Text(if (tab == 0) "Files loaded in this chat" else "Your saved attachments", style = MaterialTheme.typography.bodySmall)
                if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
                error?.let { Text(it); TextButton(onClick = { viewModel.refresh() }) { Text("Retry") } }
                LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false).heightIn(min = 80.dp, max = 300.dp)) {
                    if (rows.isEmpty()) item { Text("No matching files", Modifier.padding(16.dp)) }
                    items(rows, key = { it.localId }) { message ->
                        ListItem(headlineContent = { Text(message.text?.takeIf { it.isNotBlank() } ?: "Attachment", maxLines = 2, overflow = TextOverflow.Ellipsis) },
                            supportingContent = { Text(message.type.name.lowercase().replaceFirstChar { it.uppercase() }) },
                            trailingContent = { RadioButton(selected = selected?.localId == message.localId, onClick = { selected = message }) },
                            modifier = Modifier.clickable { selected = message })
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Button(enabled = selected != null, onClick = { selected?.let(onSend) }) { Text("Send selected item") }
                }
            } else {
                Text(if (tab == 2) "Choose photos to review, edit and caption before sending." else "Choose a document from your phone. You can review it before sending.", Modifier.padding(vertical = 20.dp))
                Button(onClick = if (tab == 2) onGallery else onPhoneFile) { Text("Select") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GaGaContactPickerSheet(onDismiss: () -> Unit, onPhoneContact: () -> Unit, onPick: (PickedContact) -> Unit,
    viewModel: AttachmentBrowserViewModel = hiltViewModel()) {
    val contacts by viewModel.contacts.collectAsStateWithLifecycle()
    val loading by viewModel.loading.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }
    var verifiedOnly by remember { mutableStateOf(false) }
    val sections = remember(contacts, query, verifiedOnly) { contactSections(contacts.filter { !verifiedOnly || it.isVerified }, query) }
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { viewModel.refresh() }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().heightIn(max = 660.dp).padding(16.dp)) {
            Text("Select contact", style = MaterialTheme.typography.titleLarge)
            GagaSearchBar(query = query, onQueryChange = { query = it }, placeholder = "Search friends")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                FilterChip(selected = verifiedOnly, onClick = { verifiedOnly = !verifiedOnly }, label = { Text("Verified accounts") })
                TextButton(onClick = onPhoneContact) { Text("Phone contacts") }
            }
            if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            error?.let { Text(it); TextButton(onClick = { viewModel.refresh() }) { Text("Retry") } }
            Row(Modifier.fillMaxWidth().heightIn(min = 120.dp, max = 420.dp)) {
                LazyColumn(state = list, modifier = Modifier.weight(1f)) {
                    if (sections.isEmpty()) item { Text("No matching friends", Modifier.padding(16.dp)) }
                    sections.forEach { (letter, people) ->
                        item(key = "section-$letter") { Text(letter, Modifier.padding(8.dp), style = MaterialTheme.typography.titleSmall) }
                        items(people, key = { it.id }) { person ->
                            ListItem(headlineContent = { Text(person.displayLabel) },
                                leadingContent = { GagaAvatar(imageUrl = person.avatar, name = person.displayLabel, size = 44.dp) },
                                supportingContent = { Text(person.username?.let { "@$it" } ?: "GaGa friend") },
                                modifier = Modifier.clickable { onPick(PickedContact(person.displayLabel, person.phone)) })
                        }
                    }
                }
                LazyColumn(Modifier.width(48.dp)) {
                    items(sections.keys.toList()) { letter ->
                        TextButton(modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp), onClick = {
                            val index = sections.entries.takeWhile { it.key != letter }.sumOf { it.value.size + 1 }
                            scope.launch { list.animateScrollToItem(index) }
                        }) { Text(letter) }
                    }
                }
            }
            Text("Choose a contact, then review the card and optional phone number.", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
fun FileReviewDialog(uri: Uri, kind: String, recipient: String, onDismiss: () -> Unit, onSend: () -> Unit) {
    val context = LocalContext.current
    var label by remember(uri) { mutableStateOf("Selected attachment") }
    var size by remember(uri) { mutableStateOf<Long?>(null) }
    var readable by remember(uri) { mutableStateOf(false) }
    LaunchedEffect(uri) {
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            runCatching { context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    label = cursor.getString(0).orEmpty().ifBlank { "Selected attachment" }
                    if (!cursor.isNull(1)) size = cursor.getLong(1)
                }
            } }
            runCatching { context.contentResolver.openInputStream(uri)?.use { readable = true } }
        }
    }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(if (kind == "audio") "Review music / audio" else "Review file") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(label); size?.let { Text("${it / 1024} KB") }; Text("Send to $recipient")
            if (!readable) Text("Checking file access. If this doesn't finish, choose the file again.")
        } }, confirmButton = { Button(onClick = onSend, enabled = readable) { Text("Send") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}
