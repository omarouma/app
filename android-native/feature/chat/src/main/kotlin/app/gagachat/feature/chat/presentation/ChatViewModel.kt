package app.gagachat.feature.chat.presentation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.MediaRepository
import app.gagachat.core.data.repository.MessageRepository
import app.gagachat.core.model.Conversation
import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageType
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
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
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val messageRepository: MessageRepository,
    private val conversationRepository: ConversationRepository,
    private val mediaRepository: MediaRepository,
    private val authRepository: AuthRepository,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val conversationId: String = savedStateHandle.get<String>("conversationId").orEmpty()

    private val draft = MutableStateFlow("")
    private val loadingOlder = MutableStateFlow(false)
    private val hasMoreOlder = MutableStateFlow(true)
    private val error = MutableStateFlow<String?>(null)
    private val notice = MutableStateFlow<String?>(null)
    private val replyTo = MutableStateFlow<Message?>(null)
    private val typing = MutableStateFlow(false)

    private val currentUserId: String
        get() = authRepository.sessionFlow.value?.userId.orEmpty()

    val state: StateFlow<ChatUiState> = combine(
        messageRepository.observeMessages(conversationId),
        conversationRepository.observeConversation(conversationId),
        draft,
        combine(loadingOlder, hasMoreOlder, error) { l, h, e -> Triple(l, h, e) },
        combine(replyTo, typing, notice) { r, t, n -> Triple(r, t, n) },
    ) { messages, conversation, draftText, (isLoadingOlder, moreOlder, errorMessage), (reply, isTyping, noticeMessage) ->
        ChatUiState(
            conversationId = conversationId,
            title = conversation?.displayTitle(currentUserId) ?: "Chat",
            subtitle = presenceSubtitle(conversation, currentUserId),
            avatarUrl = conversation?.avatar ?: conversation?.otherMember(currentUserId)?.avatar,
            messages = messages,
            currentUserId = currentUserId,
            otherUserId = conversation?.otherMember(currentUserId)?.userId.orEmpty(),
            draft = draftText,
            isLoadingOlder = isLoadingOlder,
            hasMoreOlder = moreOlder,
            errorMessage = errorMessage,
            noticeMessage = noticeMessage,
            replyTo = reply,
            isOtherTyping = isTyping,
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
    }

    fun send() {
        val text = draft.value.trim()
        if (text.isEmpty()) return
        val replyId = replyTo.value?.serverMessageId ?: replyTo.value?.clientMessageId
        draft.value = ""
        replyTo.value = null
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

    private fun presenceSubtitle(conversation: Conversation?, currentUserId: String): String? {
        if (conversation == null) return null
        val other = conversation.otherMember(currentUserId) ?: return null
        return other.displayName
    }
}
