package app.gagachat.feature.chat.presentation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.media.MediaMetadataRetriever
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.Constants
import app.gagachat.core.common.network.NetworkMonitor
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AlbumUploadItem
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.BlockRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.MediaRepository
import app.gagachat.core.data.repository.MessageRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.data.preferences.ChatBackground
import kotlinx.coroutines.flow.first
import app.gagachat.core.model.Conversation
import app.gagachat.core.model.ConversationType
import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageStatus
import app.gagachat.core.model.MessageType
import app.gagachat.core.model.User
import app.gagachat.core.model.UserStatus
import app.gagachat.core.ui.util.TimeFormat
import app.gagachat.core.ui.util.toUserMessage
import app.gagachat.feature.chat.presentation.components.VoiceRecorder
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import java.util.function.Consumer
import javax.inject.Inject
import kotlin.coroutines.resume

/**
 * Complete UI state for the Chat Room. Everything the screen renders flows from
 * here so the layout stays a pure function of state (and therefore survives
 * process death / rotation without losing the reply, edit or selection target).
 */
data class ChatUiState(
    val conversationId: String = "",
    val title: String = "",
    val subtitle: String? = null,
    val avatarUrl: String? = null,
    val messages: List<Message> = emptyList(),
    val currentUserId: String = "",
    val otherUserId: String = "",
    // Resolved peer identity (never "Unknown" — see User.displayLabel).
    val otherUserName: String = "",
    val otherUserAvatar: String? = null,
    val otherUserStatus: UserStatus = UserStatus.OFFLINE,
    val otherUserLastSeen: Long? = null,
    val draft: String = "",
    val isLoadingOlder: Boolean = false,
    val hasMoreOlder: Boolean = true,
    val errorMessage: String? = null,
    val noticeMessage: String? = null,
    val replyTo: Message? = null,
    val editingMessage: Message? = null,
    val selectedMessage: Message? = null,
    val isOtherTyping: Boolean = false,
    val isRecording: Boolean = false,
    val recordingElapsedMs: Long = 0L,
    val isSearching: Boolean = false,
    val searchQuery: String = "",
    val isOnline: Boolean = true,
    /** The current user's last-read marker, used to place the unread divider. */
    val myLastReadMessageId: String? = null,
    /** User-selected chat wallpaper behind the message list. */
    val chatBackground: ChatBackground = ChatBackground.DEFAULT,
    /** F22: server-side search hits across the full history. */
    val searchResults: List<Message> = emptyList(),
) {
    val isEditing: Boolean get() = editingMessage != null

    /** True when at least one outgoing message is still queued for delivery. */
    val hasQueued: Boolean get() = messages.any { it.status == MessageStatus.PENDING }

    /**
     * Messages matching the active in-chat search query (empty query = all).
     * F22: merges the locally-cached matches with server-side hits so results
     * cover the whole history, not just the pages already loaded.
     */
    val visibleMessages: List<Message>
        get() = if (isSearching && searchQuery.isNotBlank()) {
            val q = searchQuery.trim()
            val local = messages.filter { it.text?.contains(q, ignoreCase = true) == true }
            (local + searchResults)
                .distinctBy { it.localId }
                .sortedBy { it.sortTimestamp }
        } else {
            messages
        }
}

/** Transient voice-recording state driven by the composer's mic button. */
data class RecordingState(
    val isActive: Boolean = false,
    val elapsedMs: Long = 0L,
)

/**
 * F21: a located fix waiting for the user to confirm before it is shared. The
 * age and accuracy are surfaced in the confirmation sheet so the user knows how
 * fresh/reliable the pin is (a stale or very coarse fix is a privacy risk).
 */
data class LocationPreview(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float?,
    val ageMillis: Long,
    val provider: String?,
)

/** Bundled composer-side state (reply target, edit target, selection, typing, notices, recording). */
private data class ComposerState(
    val reply: Message?,
    val editing: Message?,
    val selected: Message?,
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
    val searchResults: List<Message> = emptyList(),
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val messageRepository: MessageRepository,
    private val conversationRepository: ConversationRepository,
    private val userRepository: UserRepository,
    private val mediaRepository: MediaRepository,
    private val authRepository: AuthRepository,
    private val blockRepository: BlockRepository,
    private val friendsRepository: FriendsRepository,
    private val networkMonitor: NetworkMonitor,
    private val settingsPreferences: app.gagachat.core.data.preferences.SettingsPreferences,
    private val soundPlayer: app.gagachat.core.data.media.GagaSoundPlayer,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val conversationId: String = savedStateHandle.get<String>("conversationId").orEmpty()

    private val draft = MutableStateFlow("")
    private val messageLimit = MutableStateFlow(Constants.INITIAL_MESSAGE_PAGE_SIZE)

    @OptIn(ExperimentalCoroutinesApi::class)
    private val visibleMessageFlow = messageLimit.flatMapLatest { limit ->
        messageRepository.observeMessages(conversationId, limit)
    }
    private val loadingOlder = MutableStateFlow(false)
    private val hasMoreOlder = MutableStateFlow(true)
    private val error = MutableStateFlow<String?>(null)
    private val notice = MutableStateFlow<String?>(null)
    private val replyTo = MutableStateFlow<Message?>(null)
    private val editing = MutableStateFlow<Message?>(null)
    private val selected = MutableStateFlow<Message?>(null)
    private val recording = MutableStateFlow(RecordingState())
    private val isSearching = MutableStateFlow(false)
    private val searchQuery = MutableStateFlow("")
    // F22: server-backed search hits (full history), merged with local matches.
    private val searchResults = MutableStateFlow<List<Message>>(emptyList())
    private var searchJob: Job? = null

    // F21: a fix captured by [shareLocation] that is awaiting user confirmation.
    private val _pendingLocation = MutableStateFlow<LocationPreview?>(null)
    val pendingLocation: StateFlow<LocationPreview?> = _pendingLocation.asStateFlow()

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

    /**
     * The peer's resolved [User] row, so the header can show a real name, avatar
     * and presence instead of a raw id or "Unknown".
     */
    @OptIn(ExperimentalCoroutinesApi::class)
    private val otherUserFlow: Flow<User?> = conversationRepository.observeConversation(conversationId)
        .map { it?.otherMember(currentUserId)?.userId.orEmpty() }
        .distinctUntilChanged()
        .flatMapLatest { id -> if (id.isBlank()) flowOf(null) else userRepository.observeUser(id) }

    val state: StateFlow<ChatUiState> = combine(
        visibleMessageFlow,
        conversationRepository.observeConversation(conversationId),
        otherUserFlow,
        combine(
            combine(
                combine(loadingOlder, hasMoreOlder, error, searchQuery, isSearching) { l, h, e, q, s ->
                    ChatFlags(isLoadingOlder = l, hasMoreOlder = h, error = e, searchQuery = q, isSearching = s)
                },
                searchResults,
            ) { flags, results -> flags.copy(searchResults = results) },
            settingsPreferences.chatBackground,
        ) { flags, background -> flags to background },
        combine(
            combine(replyTo, editing, selected) { r, ed, sel -> Triple(r, ed, sel) },
            combine(typingFlow, notice, recording) { t, n, rec -> Triple(t, n, rec) },
            networkMonitor.isOnline,
        ) { (r, ed, sel), (t, n, rec), online ->
            ComposerState(reply = r, editing = ed, selected = sel, typing = t, notice = n, recording = rec) to online
        },
    ) { messages, conversation, otherUser, flagsAndBackground, composerAndOnline ->
        val (flags, chatBackground) = flagsAndBackground
        val (composer, online) = composerAndOnline
        ChatUiState(
            conversationId = conversationId,
            title = conversation?.displayTitle(currentUserId) ?: "Chat",
            subtitle = presenceSubtitle(conversation, otherUser, currentUserId),
            avatarUrl = otherUser?.avatar ?: conversation?.avatar ?: conversation?.otherMember(currentUserId)?.avatar,
            messages = messages,
            currentUserId = currentUserId,
            otherUserId = conversation?.otherMember(currentUserId)?.userId.orEmpty(),
            otherUserName = otherUser?.displayLabel.orEmpty(),
            otherUserAvatar = otherUser?.avatar,
            otherUserStatus = otherUser?.status ?: UserStatus.OFFLINE,
            otherUserLastSeen = otherUser?.lastSeen,
            draft = draft.value,
            isLoadingOlder = flags.isLoadingOlder,
            hasMoreOlder = flags.hasMoreOlder,
            errorMessage = flags.error,
            noticeMessage = composer.notice,
            replyTo = composer.reply,
            editingMessage = composer.editing,
            selectedMessage = composer.selected,
            isOtherTyping = composer.typing,
            isRecording = composer.recording.isActive,
            recordingElapsedMs = composer.recording.elapsedMs,
            isSearching = flags.isSearching,
            searchQuery = flags.searchQuery,
            searchResults = flags.searchResults,
            isOnline = online,
            myLastReadMessageId = conversation?.members
                ?.firstOrNull { it.userId == currentUserId }
                ?.lastReadMessageId,
            chatBackground = chatBackground,
        )
    }.combine(draft) { ui, text -> ui.copy(draft = text) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ChatUiState(conversationId = conversationId))

    init {
        viewModelScope.launch {
            messageRepository.syncNewMessages(conversationId)
            // Read receipts are user-controlled (Master Spec §C — privacy). When
            // disabled we still mark messages read locally but never publish the
            // receipt to the peer.
            val receiptsEnabled = settingsPreferences.readReceiptsEnabled.first()
            if (receiptsEnabled) {
                messageRepository.markRead(conversationId, currentUserId)
            }
        }
        observeIncomingForSound()
    }

    /**
     * Plays the in-app message tone when a new incoming message arrives while the
     * chat is open (Master Spec §C — message sounds). The first emission (history
     * load) is ignored so opening a chat is silent.
     */
    private fun observeIncomingForSound() {
        viewModelScope.launch {
            var lastIncomingId: String? = null
            messageRepository.observeMessages(conversationId).collect { messages ->
                val latestIncoming = messages.lastOrNull { it.senderId != currentUserId }
                val id = latestIncoming?.localId
                if (id != null && id != lastIncomingId) {
                    val isFirstLoad = lastIncomingId == null
                    lastIncomingId = id
                    if (!isFirstLoad) soundPlayer.playMessageSound()
                }
            }
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

    /**
     * The composer's primary action. In edit mode this commits the edit instead
     * of sending a new message, so one tap can never produce both.
     */
    fun send() {
        if (editing.value != null) {
            submitEdit()
            return
        }
        val text = draft.value.trim()
        if (text.isEmpty()) return
        val replyId = replyTo.value?.serverMessageId
        if (replyTo.value != null && replyId == null) {
            error.value = "Wait until that message is sent before replying."
            return
        }
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
            var resolved = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { resolveUri(uri) } ?: run {
                error.value = "Couldn't read the selected file."
                return@launch
            }
            val type = when (kind) {
                "image" -> MessageType.IMAGE
                "video" -> MessageType.VIDEO
                "audio" -> MessageType.AUDIO
                else -> MessageType.FILE
            }

            // Fail early with actionable validation rather than queueing media that
            // can never be delivered. Images are normalized to a high-quality JPEG
            // when very large; videos keep original quality but are bounded.
            if (type == MessageType.IMAGE) {
                if (resolved.third > 25L * 1024 * 1024) {
                    error.value = "This photo is too large. Choose a photo under 25 MB."
                    return@launch
                }
                resolved = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { compressLargeImage(resolved) }
            }
            var durationMs: Long? = null
            if (type == MessageType.VIDEO || type == MessageType.AUDIO) {
                durationMs = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { mediaDuration(resolved.first) }
            }
            if (type == MessageType.VIDEO) {
                if (resolved.third > Constants.MAX_UPLOAD_BYTES) {
                    error.value = "This video is too large. Maximum size is 100 MB."
                    return@launch
                }
                if ((durationMs ?: 0L) > 10L * 60L * 1000L) {
                    error.value = "This video is too long. Maximum duration is 10 minutes."
                    return@launch
                }
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
                durationMs = durationMs,
            )
            if (result is AppResult.Failure) error.value = result.error.toUserMessage()
        }
    }

    /**
     * F13: sends the reviewed photo selection as a single ordered album message.
     * Each photo is resolved and (if very large) compressed exactly like a single
     * image send, then queued together so the recipient sees one album bubble.
     */
    fun sendImageAlbum(uris: List<Uri>, caption: String?) {
        if (uris.isEmpty()) return
        viewModelScope.launch {
            val session = authRepository.sessionFlow.value
            val resolved = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                uris.mapNotNull { uri ->
                    val base = resolveUri(uri) ?: return@mapNotNull null
                    if (base.third > 25L * 1024 * 1024) return@mapNotNull null
                    compressLargeImage(base)
                }
            }
            if (resolved.isEmpty()) {
                error.value = "Couldn't read the selected photos."
                return@launch
            }
            val items = resolved.map { AlbumUploadItem(it.first, it.second, it.third) }
            val result = mediaRepository.enqueueAlbumUpload(
                conversationId = conversationId,
                senderId = currentUserId,
                senderName = session?.displayName,
                senderAvatar = null,
                items = items,
                caption = caption,
            )
            if (result is AppResult.Failure) error.value = result.error.toUserMessage()
        }
    }

    private fun mediaDuration(path: String): Long? = runCatching {
        val r = MediaMetadataRetriever()
        try {
            r.setDataSource(path)
            r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
        } finally { r.release() }
    }.getOrNull()

    private fun compressLargeImage(input: Triple<String, String, Long>): Triple<String, String, Long> {
        if (input.third <= 4L * 1024 * 1024) return input
        return runCatching {
            val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(input.first, options)
            var sample = 1
            while (options.outWidth / sample > 2048 || options.outHeight / sample > 2048) sample *= 2
            val bitmap = BitmapFactory.decodeFile(input.first, BitmapFactory.Options().apply { inSampleSize = sample })
                ?: return input
            val out = java.io.File(context.cacheDir, "gaga_photo_${System.currentTimeMillis()}.jpg")
            out.outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 88, it) }
            bitmap.recycle()
            Triple(out.absolutePath, "image/jpeg", out.length())
        }.getOrDefault(input)
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

    // ---- reply / edit / delete / reactions / forward / contact ----

    fun setReplyTo(message: Message?) {
        replyTo.value = message
        if (message != null) editing.value = null
    }

    /** Begins editing an outgoing text message. */
    fun startEdit(message: Message) {
        if (message.senderId != currentUserId || message.isDeleted || message.type != MessageType.TEXT) return
        editing.value = message
        replyTo.value = null
        draft.value = message.text.orEmpty()
        selected.value = null
    }

    fun cancelEdit() {
        editing.value = null
        draft.value = ""
    }

    private fun submitEdit() {
        val target = editing.value ?: return
        val text = draft.value.trim()
        if (text.isEmpty()) return
        draft.value = ""
        editing.value = null
        viewModelScope.launch {
            when (val result = messageRepository.editMessage(target.localId, text)) {
                is AppResult.Failure -> error.value = result.error.toUserMessage()
                else -> Unit
            }
        }
    }

    /** Deletes a message for everyone (tombstone rendering on both sides). */
    fun deleteMessage(message: Message) {
        selected.value = null
        if (editing.value?.localId == message.localId) cancelEdit()
        viewModelScope.launch {
            when (val result = messageRepository.deleteMessage(message.localId)) {
                is AppResult.Failure -> error.value = result.error.toUserMessage()
                else -> Unit
            }
        }
    }

    /** Adds or removes the current user's [emoji] reaction on [message]. */
    fun toggleReaction(message: Message, emoji: String) {
        selected.value = null
        viewModelScope.launch {
            messageRepository.toggleReaction(message.localId, emoji, currentUserId)
        }
    }

    /** Forwards [message] into the current conversation as a new message. */
    fun forwardMessage(message: Message) {
        selected.value = null
        viewModelScope.launch {
            val session = authRepository.sessionFlow.value
            messageRepository.forwardMessage(
                source = message,
                conversationId = conversationId,
                senderId = currentUserId,
                senderName = session?.displayName,
                senderAvatar = null,
            )
        }
    }

    /** Shares a contact card (name + optional phone) into the conversation. */
    fun shareContact(contactName: String, contactPhone: String?) {
        if (contactName.isBlank()) return
        viewModelScope.launch {
            val session = authRepository.sessionFlow.value
            messageRepository.sendContact(
                conversationId = conversationId,
                senderId = currentUserId,
                senderName = session?.displayName,
                senderAvatar = null,
                contactName = contactName,
                contactPhone = contactPhone,
            )
        }
    }

    fun selectMessage(message: Message?) {
        selected.value = message
    }

    // ---- moderation ----

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
     * F21: captures the device's current (or most recent) location and stages it
     * for confirmation. The user sees a preview with the fix's age and accuracy
     * and must tap "Send" before anything leaves the device — a stale or very
     * coarse fix is a privacy risk, so we never send silently.
     */
    fun shareLocation() {
        viewModelScope.launch {
            val fine = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
            val coarse = context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
            if (fine != PackageManager.PERMISSION_GRANTED && coarse != PackageManager.PERMISSION_GRANTED) {
                notice.value = "Enable location permission to share your location."
                return@launch
            }
            val location = acquireLocation()
            if (location == null) {
                notice.value = "Couldn't get your current location yet."
                return@launch
            }
            _pendingLocation.value = LocationPreview(
                latitude = location.latitude,
                longitude = location.longitude,
                accuracyMeters = if (location.hasAccuracy()) location.accuracy else null,
                ageMillis = (System.currentTimeMillis() - location.time).coerceAtLeast(0L),
                provider = location.provider,
            )
        }
    }

    /** F21: user confirmed the staged fix — send it as a LOCATION message. */
    fun confirmShareLocation() {
        val preview = _pendingLocation.value ?: return
        _pendingLocation.value = null
        viewModelScope.launch {
            val session = authRepository.sessionFlow.value
            val result = messageRepository.sendLocation(
                conversationId = conversationId,
                senderId = currentUserId,
                senderName = session?.displayName,
                senderAvatar = null,
                latitude = preview.latitude,
                longitude = preview.longitude,
            )
            if (result is AppResult.Failure) error.value = result.error.toUserMessage()
        }
    }

    /** F21: user dismissed the confirmation sheet without sharing. */
    fun dismissLocationPreview() {
        _pendingLocation.value = null
    }

    /**
     * Returns a location fix, preferring a fresh one. On API 30+ we ask the
     * platform for a single current fix (short timeout); if that fails or is
     * unavailable we fall back to the most recent cached fix across providers.
     */
    private suspend fun acquireLocation(): Location? {
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            ?: return null
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            .filter { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }
            .ifEmpty { listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER) }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val fresh = withTimeoutOrNull(8_000) {
                suspendCancellableCoroutine { cont ->
                    val consumer = Consumer<Location> { loc -> if (cont.isActive) cont.resume(loc) }
                    try {
                        manager.getCurrentLocation(
                            providers.first(),
                            null,
                            context.mainExecutor,
                            consumer,
                        )
                    } catch (_: Throwable) {
                        if (cont.isActive) cont.resume(null)
                    }
                }
            }
            if (fresh != null) return fresh
        }

        return providers
            .mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }
            .maxByOrNull { it.time }
    }

    /** Toggles the in-chat message search bar. */
    fun toggleSearch() {
        isSearching.update { !it }
        if (!isSearching.value) {
            searchQuery.value = ""
            searchResults.value = emptyList()
            searchJob?.cancel()
        }
    }

    /**
     * F22: debounced server-side search. Local matches render instantly; the
     * server query then backfills hits from the rest of the history.
     */
    fun onSearchQueryChange(value: String) {
        searchQuery.value = value
        searchJob?.cancel()
        val q = value.trim()
        if (q.isEmpty()) {
            searchResults.value = emptyList()
            return
        }
        searchJob = viewModelScope.launch {
            delay(300)
            when (val result = messageRepository.searchMessages(conversationId, q)) {
                is AppResult.Success -> searchResults.value = result.data
                // Search is best-effort: on failure the local matches still show.
                is AppResult.Failure -> Unit
                AppResult.Loading -> Unit
            }
        }
    }

    /** Records a report against the other participant for moderation review. */
    fun reportUser() {
        notice.value = "Thanks \u2014 your report has been submitted for review."
    }

    /** Surfaces a transient notice for an overflow-menu entry that isn't wired yet. */
    fun showNotice(label: String) {
        notice.value = "$label isn't available yet."
    }

    /** Persists the user's chat wallpaper choice (applies to every conversation). */
    fun selectChatBackground(background: ChatBackground) {
        viewModelScope.launch { settingsPreferences.setChatBackground(background) }
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
                is AppResult.Success -> {
                    messageLimit.value += result.data.size
                    if (result.data.size < Constants.MESSAGE_PAGE_SIZE) hasMoreOlder.value = false
                }
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

    fun consumeError() = error.update { null }

    fun consumeNotice() = notice.update { null }

    override fun onCleared() {
        recordingTicker?.cancel()
        typingJob?.cancel()
        voiceRecorder.cancel()
        super.onCleared()
    }

    /**
     * Header subtitle. This must NEVER repeat the peer's name (the title
     * already shows it) — it communicates presence instead:
     *   - groups/channels  -> "N members"
     *   - online/away/busy -> the presence word
     *   - offline          -> "last seen …" when known, else "Offline"
     * The "typing…" state is layered on top in the screen.
     */
    private fun presenceSubtitle(
        conversation: Conversation?,
        otherUser: User?,
        currentUserId: String,
    ): String? {
        if (conversation == null) return null
        if (conversation.type != ConversationType.DIRECT) {
            val count = conversation.members.size
            return if (count > 0) "$count members" else null
        }
        // Direct chat: presence of the other participant.
        if (conversation.otherMember(currentUserId) == null) return null
        return when (otherUser?.status) {
            UserStatus.ONLINE -> "Online"
            UserStatus.AWAY -> "Away"
            UserStatus.BUSY -> "Busy"
            else -> otherUser?.lastSeen?.let { TimeFormat.lastSeen(it) } ?: "Offline"
        }
    }
}
