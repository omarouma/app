package app.gagachat.feature.chat.presentation

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Forward
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.filled.AddReaction
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageType
import app.gagachat.core.ui.component.GagaEmptyState
import app.gagachat.core.ui.component.GagaOfflineBanner
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.feature.chat.presentation.components.DateSeparator
import app.gagachat.feature.chat.presentation.components.MediaViewerOverlay
import app.gagachat.feature.chat.presentation.components.MessageBubble
import app.gagachat.feature.chat.presentation.components.MessageComposer
import app.gagachat.feature.chat.presentation.components.TypingIndicator
import app.gagachat.feature.chat.presentation.components.rememberContactPicker
import app.gagachat.feature.chat.presentation.components.rememberMediaPicker
import kotlinx.coroutines.launch

private val QuickReactions = listOf("\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDE4F")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatRoute(
    onNavigateBack: () -> Unit,
    onStartCall: (conversationId: String, isVideo: Boolean) -> Unit,
    onOpenProfile: (userId: String) -> Unit,
    onSendMoney: () -> Unit,
    onOpenChatInfo: (conversationId: String) -> Unit,
    viewModel: ChatViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    val mediaPicker = rememberMediaPicker(
        onImagePicked = { viewModel.sendMedia(it, "image") },
        onVideoPicked = { viewModel.sendMedia(it, "video") },
        onFilePicked = { viewModel.sendMedia(it, "file") },
    )
    val contactPicker = rememberContactPicker(
        onContactPicked = { viewModel.shareContact(it.name, it.phone) },
    )
    val context = LocalContext.current
    var viewerMessage by remember { mutableStateOf<Message?>(null) }
    // Requests RECORD_AUDIO the first time the mic is tapped, then starts the
    // recording. If the user denies, the ViewModel surfaces an actionable notice.
    val micPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { viewModel.startVoiceRecording() }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeError()
        }
    }

    LaunchedEffect(state.noticeMessage) {
        state.noticeMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeNotice()
        }
    }

    // Load older messages when the user scrolls near the top of the history.
    val shouldLoadOlder by remember {
        derivedStateOf {
            val firstVisible = listState.firstVisibleItemIndex
            firstVisible <= 2 && state.hasMoreOlder && !state.isLoadingOlder
        }
    }
    LaunchedEffect(shouldLoadOlder) {
        if (shouldLoadOlder) viewModel.loadOlder()
    }

    // Jump to the newest message whenever a fresh one arrives while pinned near
    // the bottom (reverseLayout => index 0 is the newest).
    val atBottom by remember {
        derivedStateOf { listState.firstVisibleItemIndex <= 1 }
    }
    LaunchedEffect(state.messages.lastOrNull()?.localId) {
        if (atBottom) listState.animateScrollToItem(0)
    }

    val openProfile = {
        val id = state.otherUserId
        if (id.isNotBlank()) onOpenProfile(id)
        else viewModel.showNotice("Couldn't open this profile yet.")
    }

    Box(modifier = Modifier.fillMaxSize()) {
        GagaScaffold(
            title = state.title,
            subtitle = if (state.isOtherTyping) "typing\u2026" else state.subtitle,
            onBack = onNavigateBack,
            avatarUrl = state.otherUserAvatar ?: state.avatarUrl,
            avatarStatus = state.otherUserStatus,
            onTitleClick = openProfile,
            snackbarHostState = snackbarHostState,
            actions = {
                IconButton(onClick = { onStartCall(state.conversationId, false) }) {
                    Icon(Icons.Filled.Call, contentDescription = "Voice call")
                }
                IconButton(onClick = { onStartCall(state.conversationId, true) }) {
                    Icon(Icons.Filled.Videocam, contentDescription = "Video call")
                }
                ChatOverflowMenu(
                    onViewProfile = openProfile,
                    onChatInfo = { onOpenChatInfo(state.conversationId) },
                    onSendMoney = onSendMoney,
                    onBlockUser = viewModel::blockUser,
                    onRemoveFriend = viewModel::removeFriend,
                    onSearch = viewModel::toggleSearch,
                    onReport = viewModel::reportUser,
                    onAction = { label ->
                        snackbarHostState.currentSnackbarData?.dismiss()
                        viewModel.showNotice(label)
                    },
                )
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                GagaOfflineBanner(visible = !state.isOnline)
                if (state.isSearching) {
                    MessageSearchBar(
                        query = state.searchQuery,
                        onQueryChange = viewModel::onSearchQueryChange,
                        onClose = viewModel::toggleSearch,
                    )
                }
                Box(modifier = Modifier.weight(1f)) {
                    val visible = state.visibleMessages
                    val isFiltering = state.isSearching && state.searchQuery.isNotBlank()
                    if (visible.isEmpty() && !state.isLoadingOlder) {
                        GagaEmptyState(
                            icon = Icons.AutoMirrored.Filled.Chat,
                            title = if (isFiltering) "No matches" else "No messages yet",
                            description = if (isFiltering) {
                                "Try a different search term."
                            } else {
                                "Say hi to start the conversation."
                            },
                        )
                    } else {
                        MessageList(
                            messages = visible,
                            currentUserId = state.currentUserId,
                            myLastReadMessageId = state.myLastReadMessageId,
                            isLoadingOlder = state.isLoadingOlder,
                            isOtherTyping = state.isOtherTyping && !isFiltering,
                            typingAvatarUrl = state.otherUserAvatar ?: state.avatarUrl,
                            typingName = state.otherUserName.ifBlank { state.title },
                            listState = listState,
                            onRetry = viewModel::retry,
                            onLongPress = viewModel::selectMessage,
                            onMediaClick = { viewerMessage = it },
                            onReactionClick = { m, e -> viewModel.toggleReaction(m, e) },
                            onReplyClick = { target ->
                                val idx = visible.indexOfFirst {
                                    it.localId == target.localId
                                }
                                if (idx >= 0) {
                                    scope.launch {
                                        // reverseLayout: scroll index = size - 1 - idx
                                        val target0 = visible.size - 1 - idx
                                        listState.animateScrollToItem(target0)
                                    }
                                }
                            },
                        )
                    }

                    // Scroll-to-bottom affordance (Phase 12.2): appears the moment
                    // the user scrolls away from the newest message.
                    ScrollToBottomButton(
                        visible = !atBottom,
                        onClick = { scope.launch { listState.animateScrollToItem(0) } },
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(GagaDimens.space16),
                    )
                }
                MessageComposer(
                    draft = state.draft,
                    onDraftChange = viewModel::onDraftChange,
                    onSend = viewModel::send,
                    replyTo = state.replyTo,
                    onCancelReply = { viewModel.setReplyTo(null) },
                    editingMessage = state.editingMessage,
                    onCancelEdit = viewModel::cancelEdit,
                    onAttach = mediaPicker.pickFile,
                    onPickImage = mediaPicker.pickImage,
                    onPickVideo = mediaPicker.pickVideo,
                    onShareLocation = { viewModel.shareLocation() },
                    onPickContact = contactPicker,
                    isRecording = state.isRecording,
                    recordingElapsedMs = state.recordingElapsedMs,
                    onStartRecording = {
                        val granted = ContextCompat.checkSelfPermission(
                            context,
                            Manifest.permission.RECORD_AUDIO,
                        ) == PackageManager.PERMISSION_GRANTED
                        if (granted) {
                            viewModel.startVoiceRecording()
                        } else {
                            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    },
                    onStopRecording = viewModel::stopVoiceRecordingAndSend,
                    onCancelRecording = viewModel::cancelVoiceRecording,
                )
            }
        }

        viewerMessage?.let { message ->
            MediaViewerOverlay(message = message, onDismiss = { viewerMessage = null })
        }

        state.selectedMessage?.let { selected ->
            MessageActionSheet(
                message = selected,
                currentUserId = state.currentUserId,
                onDismiss = { viewModel.selectMessage(null) },
                onReply = {
                    viewModel.setReplyTo(selected)
                    viewModel.selectMessage(null)
                },
                onReact = { emoji ->
                    viewModel.toggleReaction(selected, emoji)
                    viewModel.selectMessage(null)
                },
                onEdit = {
                    viewModel.startEdit(selected)
                    viewModel.selectMessage(null)
                },
                onForward = {
                    viewModel.forwardMessage(selected)
                    viewModel.selectMessage(null)
                },
                onCopy = {
                    clipboard.setText(AnnotatedString(selected.text.orEmpty()))
                    viewModel.selectMessage(null)
                    scope.launch { snackbarHostState.showSnackbar("Copied") }
                },
                onDelete = {
                    viewModel.deleteMessage(selected)
                    viewModel.selectMessage(null)
                },
            )
        }
    }
}

/** Floating "jump to latest" button shown when the user scrolls up the history. */
@Composable
private fun ScrollToBottomButton(
    visible: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(),
        exit = fadeOut(),
        modifier = modifier,
    ) {
        SmallFloatingActionButton(
            onClick = onClick,
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ) {
            Icon(Icons.Filled.ArrowDownward, contentDescription = "Jump to latest")
        }
    }
}

/**
 * Long-press message action sheet (Phase 4.5): quick reactions plus reply, edit,
 * forward, copy and delete. Edit/delete are only offered for the user's own
 * messages; copy only for text.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MessageActionSheet(
    message: Message,
    currentUserId: String,
    onDismiss: () -> Unit,
    onReply: () -> Unit,
    onReact: (String) -> Unit,
    onEdit: () -> Unit,
    onForward: () -> Unit,
    onCopy: () -> Unit,
    onDelete: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val isOwn = message.senderId == currentUserId
    val canEdit = isOwn && message.type == MessageType.TEXT && !message.isDeleted
    val canCopy = !message.text.isNullOrBlank() && !message.isDeleted
    val canDelete = isOwn && !message.isDeleted

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.padding(bottom = GagaDimens.space16)) {
            // Quick reaction strip.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                QuickReactions.forEach { emoji ->
                    Surface(
                        shape = CircleShape,
                        color = if (message.hasReaction(emoji, currentUserId)) {
                            MaterialTheme.colorScheme.primaryContainer
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant
                        },
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .clickable { onReact(emoji) },
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(text = emoji, style = MaterialTheme.typography.titleLarge)
                        }
                    }
                }
            }
            HorizontalDivider()
            ActionRow(Icons.AutoMirrored.Filled.Reply, "Reply", onReply)
            ActionRow(Icons.Filled.AddReaction, "React", { onReact(QuickReactions.first()) })
            if (canEdit) ActionRow(Icons.Filled.Edit, "Edit", onEdit)
            ActionRow(Icons.AutoMirrored.Filled.Forward, "Forward", onForward)
            if (canCopy) ActionRow(Icons.Filled.ContentCopy, "Copy", onCopy)
            if (canDelete) {
                ActionRow(
                    icon = Icons.Filled.Delete,
                    label = "Delete",
                    onClick = onDelete,
                    tint = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun ActionRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
    tint: Color = MaterialTheme.colorScheme.onSurface,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = GagaDimens.space24, vertical = GagaDimens.space12),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = tint)
        Spacer(Modifier.width(GagaDimens.space16))
        Text(text = label, color = tint, style = MaterialTheme.typography.bodyLarge)
    }
}

/**
 * Inline message search bar (reference screenshot 174606 — "Search Messages").
 * Filters the currently loaded history by text; the close button restores the
 * full conversation.
 */
@Composable
private fun MessageSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    onClose: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 2.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space4),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Search, contentDescription = null)
            Spacer(Modifier.width(GagaDimens.space8))
            TextField(
                value = query,
                onValueChange = onQueryChange,
                modifier = Modifier.weight(1f),
                placeholder = { Text("Search messages") },
                singleLine = true,
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
            )
            IconButton(onClick = onClose) {
                Icon(Icons.Filled.Close, contentDescription = "Close search")
            }
        }
    }
}

/**
 * The conversation overflow menu (reference screenshot 174606): Search Messages,
 * Chat Background, Send Money, View Profile, Chat Info, Remove Friend, Block User
 * and Report User. "Search Messages", "View Profile", "Block User", "Remove
 * Friend" and "Report User" are wired; "Chat Background" surfaces a transient
 * notice until its owning feature lands (deferred to the UI-polish phase).
 */
@Composable
private fun ChatOverflowMenu(
    onViewProfile: () -> Unit,
    onChatInfo: () -> Unit,
    onSendMoney: () -> Unit,
    onBlockUser: () -> Unit,
    onRemoveFriend: () -> Unit,
    onSearch: () -> Unit,
    onReport: () -> Unit,
    onAction: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    IconButton(onClick = { expanded = true }) {
        Icon(Icons.Filled.MoreVert, contentDescription = "More")
    }
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        MenuItem("Search Messages") { expanded = false; onSearch() }
        MenuItem("Chat Background") { expanded = false; onAction("Chat Background") }
        MenuItem("Send Money") {
            expanded = false
            onSendMoney()
        }
        MenuItem("View Profile") {
            expanded = false
            onViewProfile()
        }
        MenuItem("Chat Info") {
            expanded = false
            onChatInfo()
        }
        MenuItem("Remove Friend") {
            expanded = false
            onRemoveFriend()
        }
        MenuItem("Block User") {
            expanded = false
            onBlockUser()
        }
        MenuItem("Report User") { expanded = false; onReport() }
    }
}

@Composable
private fun MenuItem(label: String, onClick: () -> Unit) {
    DropdownMenuItem(
        text = { Text(label) },
        onClick = onClick,
    )
}

@Composable
private fun MessageList(
    messages: List<Message>,
    currentUserId: String,
    myLastReadMessageId: String?,
    isLoadingOlder: Boolean,
    isOtherTyping: Boolean,
    typingAvatarUrl: String?,
    typingName: String?,
    listState: androidx.compose.foundation.lazy.LazyListState,
    onRetry: (Message) -> Unit,
    onLongPress: (Message) -> Unit,
    onMediaClick: (Message) -> Unit,
    onReactionClick: (Message, String) -> Unit,
    onReplyClick: (Message) -> Unit,
) {
    // Newest at the bottom: reverse the list and use reverseLayout so the view
    // stays pinned to the latest message without manual scroll math.
    val reversed = remember(messages) { messages.asReversed() }

    // The oldest unread incoming message gets the "unread" divider above it.
    val firstUnreadLocalId = remember(messages, myLastReadMessageId, currentUserId) {
        if (myLastReadMessageId == null) {
            null
        } else {
            val readIdx = messages.indexOfFirst {
                it.serverMessageId == myLastReadMessageId ||
                    it.clientMessageId == myLastReadMessageId
            }
            if (readIdx < 0) {
                null
            } else {
                messages.drop(readIdx + 1)
                    .firstOrNull { it.senderId != currentUserId }
                    ?.localId
            }
        }
    }

    LazyColumn(
        state = listState,
        reverseLayout = true,
        modifier = Modifier.fillMaxSize(),
    ) {
        if (isOtherTyping) {
            item(key = "typing") {
                TypingIndicator(avatarUrl = typingAvatarUrl, name = typingName)
            }
        }
        items(
            count = reversed.size,
            key = { index -> reversed[index].localId },
        ) { index ->
            val message = reversed[index]
            val isOutgoing = message.senderId == currentUserId
            // Show a date separator when the day changes between adjacent rows.
            val older = reversed.getOrNull(index + 1)
            val showSeparator = older == null ||
                !isSameDay(older.sortTimestamp, message.sortTimestamp)
            val repliedMessage = message.replyToMessageId?.let { id ->
                messages.firstOrNull {
                    it.serverMessageId == id || it.clientMessageId == id
                }
            }
            val showUnreadDivider = message.localId == firstUnreadLocalId

            Column(modifier = Modifier.fillMaxWidth()) {
                MessageBubble(
                    message = message,
                    isOutgoing = isOutgoing,
                    currentUserId = currentUserId,
                    repliedMessage = repliedMessage,
                    onRetry = { onRetry(message) },
                    onMediaClick = onMediaClick,
                    onLongPress = onLongPress,
                    onReactionClick = onReactionClick,
                    onReplyClick = onReplyClick,
                )
                if (showSeparator) {
                    DateSeparator(epochMillis = message.sortTimestamp)
                }
                if (showUnreadDivider) {
                    UnreadDivider()
                }
            }
        }
        if (isLoadingOlder) {
            item(key = "loading_older") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(GagaDimens.space12),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(modifier = Modifier.padding(GagaDimens.space8))
                }
            }
        }
    }
}

/** A thin "New messages" rule separating read from unread history. */
@Composable
private fun UnreadDivider() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HorizontalDivider(modifier = Modifier.weight(1f))
        Text(
            text = "New messages",
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(horizontal = GagaDimens.space8),
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        HorizontalDivider(modifier = Modifier.weight(1f))
    }
}

private fun isSameDay(a: Long, b: Long): Boolean {
    val calA = java.util.Calendar.getInstance().apply { timeInMillis = a }
    val calB = java.util.Calendar.getInstance().apply { timeInMillis = b }
    return calA.get(java.util.Calendar.YEAR) == calB.get(java.util.Calendar.YEAR) &&
        calA.get(java.util.Calendar.DAY_OF_YEAR) == calB.get(java.util.Calendar.DAY_OF_YEAR)
}
