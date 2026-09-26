package app.gagachat.feature.chat.presentation

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.Message
import app.gagachat.core.ui.component.GagaEmptyState
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.feature.chat.presentation.components.DateSeparator
import app.gagachat.feature.chat.presentation.components.MessageBubble
import app.gagachat.feature.chat.presentation.components.MessageComposer
import app.gagachat.feature.chat.presentation.components.TypingIndicator
import app.gagachat.feature.chat.presentation.components.rememberMediaPicker

@Composable
fun ChatRoute(
    onNavigateBack: () -> Unit,
    onStartCall: (conversationId: String, isVideo: Boolean) -> Unit,
    onOpenProfile: (userId: String) -> Unit,
    onSendMoney: () -> Unit,
    viewModel: ChatViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val listState = rememberLazyListState()
    val mediaPicker = rememberMediaPicker(
        onImagePicked = { viewModel.sendMedia(it, "image") },
        onVideoPicked = { viewModel.sendMedia(it, "video") },
        onFilePicked = { viewModel.sendMedia(it, "file") },
    )
    val context = LocalContext.current
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

    GagaScaffold(
        title = state.title,
        subtitle = if (state.isOtherTyping) "typing\u2026" else state.subtitle,
        onBack = onNavigateBack,
        snackbarHostState = snackbarHostState,
        actions = {
            IconButton(onClick = { onStartCall(state.conversationId, false) }) {
                Icon(Icons.Filled.Call, contentDescription = "Voice call")
            }
            IconButton(onClick = { onStartCall(state.conversationId, true) }) {
                Icon(Icons.Filled.Videocam, contentDescription = "Video call")
            }
            ChatOverflowMenu(
                onViewProfile = {
                    if (state.otherUserId.isNotBlank()) onOpenProfile(state.otherUserId)
                },
                onChatInfo = {
                    if (state.otherUserId.isNotBlank()) onOpenProfile(state.otherUserId)
                },
                onSendMoney = onSendMoney,
                onBlockUser = viewModel::blockUser,
                onRemoveFriend = viewModel::removeFriend,
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
            Box(modifier = Modifier.weight(1f)) {
                if (state.messages.isEmpty() && !state.isLoadingOlder) {
                    GagaEmptyState(
                        icon = Icons.AutoMirrored.Filled.Chat,
                        title = "No messages yet",
                        description = "Say hi to start the conversation.",
                    )
                } else {
                    MessageList(
                        messages = state.messages,
                        currentUserId = state.currentUserId,
                        isLoadingOlder = state.isLoadingOlder,
                        isOtherTyping = state.isOtherTyping,
                        listState = listState,
                        onRetry = viewModel::retry,
                        onLongPress = viewModel::setReplyTo,
                    )
                }
            }
            MessageComposer(
                draft = state.draft,
                onDraftChange = viewModel::onDraftChange,
                onSend = viewModel::send,
                replyTo = state.replyTo,
                onCancelReply = { viewModel.setReplyTo(null) },
                onAttach = mediaPicker.pickFile,
                onPickImage = mediaPicker.pickImage,
                onShareLocation = { viewModel.shareLocation() },
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
}

/**
 * The conversation overflow menu (reference screenshot 174606): Search Messages,
 * Chat Background, Send Money, View Profile, Chat Info, Remove Friend, Block User
 * and Report User. "View Profile", "Block User" and "Remove Friend" are fully
 * wired; the remaining entries surface a transient notice until their owning
 * features land.
 */
@Composable
private fun ChatOverflowMenu(
    onViewProfile: () -> Unit,
    onChatInfo: () -> Unit,
    onSendMoney: () -> Unit,
    onBlockUser: () -> Unit,
    onRemoveFriend: () -> Unit,
    onAction: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    IconButton(onClick = { expanded = true }) {
        Icon(Icons.Filled.MoreVert, contentDescription = "More")
    }
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        MenuItem("Search Messages") { expanded = false; onAction("Search Messages") }
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
        MenuItem("Report User") { expanded = false; onAction("Report User") }
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
    isLoadingOlder: Boolean,
    isOtherTyping: Boolean,
    listState: androidx.compose.foundation.lazy.LazyListState,
    onRetry: (Message) -> Unit,
    onLongPress: (Message) -> Unit,
) {
    // Newest at the bottom: reverse the list and use reverseLayout so the view
    // stays pinned to the latest message without manual scroll math.
    val reversed = remember(messages) { messages.asReversed() }

    LazyColumn(
        state = listState,
        reverseLayout = true,
        modifier = Modifier.fillMaxSize(),
    ) {
        if (isOtherTyping) {
            item(key = "typing") { TypingIndicator() }
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

            Column(modifier = Modifier.fillMaxWidth()) {
                MessageBubble(
                    message = message,
                    isOutgoing = isOutgoing,
                    onRetry = { onRetry(message) },
                )
                if (showSeparator) {
                    DateSeparator(epochMillis = message.sortTimestamp)
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

private fun isSameDay(a: Long, b: Long): Boolean {
    val calA = java.util.Calendar.getInstance().apply { timeInMillis = a }
    val calB = java.util.Calendar.getInstance().apply { timeInMillis = b }
    return calA.get(java.util.Calendar.YEAR) == calB.get(java.util.Calendar.YEAR) &&
        calA.get(java.util.Calendar.DAY_OF_YEAR) == calB.get(java.util.Calendar.DAY_OF_YEAR)
}
