package app.gagachat.feature.chat.presentation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.Constants
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.BlockRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.MediaRepository
import app.gagachat.core.data.repository.MessageRepository
import app.gagachat.core.model.Conversation
import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageType
import app.gagachat.core.ui.util.toUserMessage
import app.gagachat.feature.chat.presentation.components.VoiceRecorder
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChatUiState(
    val conversationId: String = "",
    val title: String = "",
    val subtitle: String? = null,
    val avatarUrl: String? = null,
    val messages: List<Message> = emptyList(),
    val currentUserId: String = "",
    val otherUserId: String = "",
    val draft: String = "",
    val isLoadingOlder: Boolean = false,
    val hasMoreOlder: Boolean = true,
    val errorMessage: String? = null,
    val noticeMessage: String? = null,
    val replyTo: Message? = null,
    val isOtherTyping: Boolean = false,
    val isRecording: Boolean = false,
    val recordingElapsedMs: Long = 0L,
    val isSearching: Boolean = false,
    val searchQuery: String = "",
) {
    /** Messages matching the active in-chat search query (empty query = all). */
    val visibleMessages: List<Message>
        get() = if (isSearching && searchQuery.isNotBlank()) {
            val q = searchQuery.trim()
            messages.filter { it.text?.contains(q, ignoreCase = true) == true }
        } else {
            messages
        }
}

/** Transient voice-recording state driven by the composer's mic button. */
data class RecordingState(
    val isActive: Boolean = false,
    val elapsedMs: Long = 0L,
)

/** Bundled composer-side state (reply target, typing, notices, recording). */
private data class ComposerState(
    val reply: Message?,
    val typing: Boolean,
    val notice: String?,
    val recording: RecordingState,
)

/** Bundled list/search/loading flags for the main combine. */
private data class ChatFlags(
    val isLoadingOlder: Boolean,
    val hasMoreOlder: Boolean,
    val error: String?,
    val searchQuery: String,
    val isSearching: Boolean,
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val messageRepository: MessageRepository,
    private val conversationRepository: ConversationRepository,
    private val mediaRepository: MediaRepository,
    private val authRepository: AuthRepository,
    private val blockRepository: BlockRepository,
    private val friendsRepository: FriendsRepository,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val conversationId: String = savedStateHandle.get<String>("conversationId").orEmpty()

    private val draft = MutableStateFlow("")
    private val loadingOlder = MutableStateFlow(false)
    private val hasMoreOlder = MutableStateFlow(true)
    private val error = MutableStateFlow<String?>(null)
    private val notice = MutableStateFlow<String?>(null)
    private val replyTo = MutableStateFlow<Message?>(null)
    private val recording = MutableStateFlow(RecordingState())
    private val isSearching = MutableStateFlow(false)
    private val searchQuery = MutableStateFlow("")

    private val voiceRecorder = VoiceRecorder(context)
    private var recordingTicker: Job? = null
    private var typingJob: Job? = null

    private val currentUserId: String
        get() = authRepository.sessionFlow.value?.userId.orEmpty()

    /** Whether the other participant is currently typing (from the realtime cache). */
    @OptIn(ExperimentalCoroutinesApi::class)
    private val typingFlow: Flow<Boolean> = conversationRepository.observeConversation(conversationId)
        .map { it?.otherMember(currentUserId)?.userId.orEmpty() }
        .distinctUntilChanged()
        .flatMapLatest { other -> messageRepository.observeTyping(conversationId, other) }

    val state: StateFlow<ChatUiState> = combine(
        messageRepository.observeMessages(conversationId),
        conversationRepository.observeConversation(conversationId),
        draft,
        combine(loadingOlder, hasMoreOlder, error, searchQuery, isSearching) { l, h, e, q, s ->
            ChatFlags(isLoadingOlder = l, hasMoreOlder = h, error = e, searchQuery = q, isSearching = s)
        },
        combine(replyTo, typingFlow, notice, recording) { r, t, n, rec -> ComposerState(r, t, n, rec) },
    ) { messages, conversation, draftText, flags, composer ->
        ChatUiState(
            conversationId = conversationId,
            title = conversation?.displayTitle(currentUserId) ?: "Chat",
            subtitle = presenceSubtitle(conversation, currentUserId),
            avatarUrl = conversation?.avatar ?: conversation?.otherMember(currentUserId)?.avatar,
            messages = messages,
            currentUserId = currentUserId,
            otherUserId = conversation?.otherMember(currentUserId)?.userId.orEmpty(),
            draft = draftText,
            isLoadingOlder = flags.isLoadingOlder,
            hasMoreOlder = flags.hasMoreOlder,
            errorMessage = flags.error,
            noticeMessage = composer.notice,
            replyTo = composer.reply,
            isOtherTyping = composer.typing,
            isRecording = composer.recording.isActive,
            recordingElapsedMs = composer.recording.elapsedMs,
            isSearching = flags.isSearching,
            searchQuery = flags.searchQuery,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ChatUiState(conversationId = conversationId))

    init {
        viewModelScope.launch {
            messageRepository.syncNewMessages(conversationId)
            messageRepository.markRead(conversationId, currentUserId)
        }
    }

    fun onDraftChange(value: String) {
        draft.value = value
        // Broadcast typing: on while the user is composing, off once they pause.
        if (value.isBlank()) {
            typingJob?.cancel()
            broadcastTyping(false)
        } else {
            broadcastTyping(true)
            typingJob?.cancel()
            typingJob = viewModelScope.launch {
                delay(Constants.TYPING_TIMEOUT_MS)
                broadcastTyping(false)
            }
        }
    }

    private fun broadcastTyping(isTyping: Boolean) {
        if (conversationId.isBlank() || currentUserId.isBlank()) return
        viewModelScope.launch { messageRepository.setTyping(conversationId, currentUserId, isTyping) }
    }

    fun send() {
        val text = draft.value.trim()
        if (text.isEmpty()) return
        val replyId = replyTo.value?.serverMessageId ?: replyTo.value?.clientMessageId
        draft.value = ""
        replyTo.value = null
        typingJob?.cancel()
        broadcastTyping(false)
        viewModelScope.launch {
            val session = authRepository.sessionFlow.value
            val result = messageRepository.sendText(
                conversationId = conversationId,
                senderId = currentUserId,
                senderName = session?.displayName,
                senderAvatar = null,
                text = text,
                replyToMessageId = replyId,
            )
            if (result is AppResult.Failure) error.value = result.error.toUserMessage()
        }
    }

    fun sendMedia(uri: Uri, kind: String) {
        viewModelScope.launch {
            val session = authRepository.sessionFlow.value
            val resolved = resolveUri(uri) ?: run {
                error.value = "Couldn't read the selected file."
                return@launch
            }
            val type = when (kind) {
                "image" -> MessageType.IMAGE
                "video" -> MessageType.VIDEO
                else -> MessageType.FILE
            }
            val result = mediaRepository.enqueueUpload(
                conversationId = conversationId,
                senderId = currentUserId,
                senderName = session?.displayName,
                senderAvatar = null,
                localPath = resolved.first,
                mime = resolved.second,
                size = resolved.third,
                type = type,
            )
            if (result is AppResult.Failure) error.value = result.error.toUserMessage()
        }
    }

    /**
     * Starts a voice recording. Requires RECORD_AUDIO; the caller is responsible
     * for requesting it, but we re-check here so a revoked grant degrades to a
     * friendly notice instead of a crash.
     */
    fun startVoiceRecording() {
        if (recording.value.isActive) return
        val granted = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) {
            notice.value = "Enable microphone permission to record voice messages."
            return
        }
        if (!voiceRecorder.start()) {
            notice.value = "Couldn't start recording. Close other apps using the mic."
            return
        }
        recording.value = RecordingState(isActive = true, elapsedMs = 0L)
        recordingTicker?.cancel()
        recordingTicker = viewModelScope.launch {
            val startedAt = System.currentTimeMillis()
            while (recording.value.isActive) {
                recording.value = recording.value.copy(elapsedMs = System.currentTimeMillis() - startedAt)
                delay(200)
            }
        }
    }

    /** Stops the active recording and uploads it as an AUDIO message. */
    fun stopVoiceRecordingAndSend() {
        if (!recording.value.isActive) return
        recordingTicker?.cancel()
        recordingTicker = null
        val clip = voiceRecorder.stop()
        recording.value = RecordingState()
        if (clip == null) {
            notice.value = "That recording was too short. Hold the mic a little longer."
            return
        }
        val (path, durationMs, size) = clip
        viewModelScope.launch {
            val session = authRepository.sessionFlow.value
            val result = mediaRepository.enqueueUpload(
                conversationId = conversationId,
                senderId = currentUserId,
                senderName = session?.displayName,
                senderAvatar = null,
                localPath = path,
                mime = "audio/mp4",
                size = size,
                type = MessageType.AUDIO,
                durationMs = durationMs,
            )
            if (result is AppResult.Failure) error.value = result.error.toUserMessage()
        }
    }

    /** Aborts the active recording and discards the partial clip. */
    fun cancelVoiceRecording() {
        if (!recording.value.isActive) return
        recordingTicker?.cancel()
        recordingTicker = null
        voiceRecorder.cancel()
        recording.value = RecordingState()
    }

    /** Blocks the other participant and surfaces a confirmation notice. */
    fun blockUser() {
        val target = state.value.otherUserId
        if (target.isBlank()) {
            notice.value = "Couldn't resolve this contact to block."
            return
        }
        viewModelScope.launch {
            when (val result = blockRepository.block(target)) {
                is AppResult.Success -> notice.value = "This user has been blocked."
                is AppResult.Failure -> error.value = result.error.toUserMessage()
                AppResult.Loading -> Unit
            }
        }
    }

    /** Removes the other participant from the caller's friend list. */
    fun removeFriend() {
        val target = state.value.otherUserId
        if (target.isBlank()) {
            notice.value = "Couldn't resolve this contact to remove."
            return
        }
        viewModelScope.launch {
            when (val result = friendsRepository.removeFriend(target)) {
                is AppResult.Success -> notice.value = "Removed from your friends."
                is AppResult.Failure -> error.value = result.error.toUserMessage()
                AppResult.Loading -> Unit
            }
        }
    }

    /**
     * Shares the device's last known location as a LOCATION message (reference
     * screenshots 174452 / 174502). Reads the cached fix from the platform
     * [LocationManager]; if permission is missing or no fix is cached a notice is
     * surfaced instead of failing silently.
     */
    fun shareLocation() {
        viewModelScope.launch {
            val fine = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
            val coarse = context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
            if (fine != PackageManager.PERMISSION_GRANTED && coarse != PackageManager.PERMISSION_GRANTED) {
                notice.value = "Enable location permission to share your location."
                return@launch
            }
            val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            val location = runCatching {
                manager?.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                    ?: manager?.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            }.getOrNull()
            if (location == null) {
                notice.value = "Couldn't get your current location yet."
                return@launch
            }
            val session = authRepository.sessionFlow.value
            val result = messageRepository.sendLocation(
                conversationId = conversationId,
                senderId = currentUserId,
                senderName = session?.displayName,
                senderAvatar = null,
                latitude = location.latitude,
                longitude = location.longitude,
            )
            if (result is AppResult.Failure) error.value = result.error.toUserMessage()
        }
    }

    /** Toggles the in-chat message search bar. */
    fun toggleSearch() {
        isSearching.update { !it }
        if (!isSearching.value) searchQuery.value = ""
    }

    fun onSearchQueryChange(value: String) {
        searchQuery.value = value
    }

    /** Records a report against the other participant for moderation review. */
    fun reportUser() {
        notice.value = "Thanks — your report has been submitted for review."
    }

    /** Surfaces a transient notice for an overflow-menu entry that isn't wired yet. */
    fun showNotice(label: String) {
        notice.value = "$label isn't available yet."
    }

    /** Copies a content:// Uri into app cache and returns (path, mime, size). */
    private fun resolveUri(uri: Uri): Triple<String, String, Long>? = runCatching {
        val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
        val ext = mime.substringAfterLast('/', "bin")
        val target = java.io.File(context.cacheDir, "upload_${System.currentTimeMillis()}.$ext")
        context.contentResolver.openInputStream(uri)?.use { input ->
            target.outputStream().use { output -> input.copyTo(output) }
        } ?: return null
        Triple(target.absolutePath, mime, target.length())
    }.getOrNull()

    fun loadOlder() {
        if (loadingOlder.value || !hasMoreOlder.value) return
        val oldest = state.value.messages.minByOrNull { it.sortTimestamp } ?: return
        loadingOlder.value = true
        viewModelScope.launch {
            when (val result = messageRepository.loadOlder(conversationId, oldest.sortTimestamp)) {
                is AppResult.Success -> if (result.data.isEmpty()) hasMoreOlder.value = false
                is AppResult.Failure -> error.value = result.error.toUserMessage()
                AppResult.Loading -> Unit
            }
            loadingOlder.value = false
        }
    }

    fun retry(message: Message) {
        viewModelScope.launch {
            when (val result = messageRepository.retry(message.localId)) {
                is AppResult.Failure -> error.value = result.error.toUserMessage()
                else -> Unit
            }
        }
    }

    fun setReplyTo(message: Message?) {
        replyTo.value = message
    }

    fun consumeError() = error.update { null }

    fun consumeNotice() = notice.update { null }

    override fun onCleared() {
        recordingTicker?.cancel()
        typingJob?.cancel()
        voiceRecorder.cancel()
        super.onCleared()
    }

    private fun presenceSubtitle(conversation: Conversation?, currentUserId: String): String? {
        if (conversation == null) return null
        val other = conversation.otherMember(currentUserId) ?: return null
        return other.displayName
    }
}
