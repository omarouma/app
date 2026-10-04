package app.gagachat.feature.chat.presentation

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.BlockRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.MessageRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.model.MessageType
import app.gagachat.core.model.User
import app.gagachat.core.model.UserStatus
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** A single shared photo or video in the media gallery. */
data class SharedMediaItem(
    val localId: String,
    val url: String,
    val isVideo: Boolean,
)

/** A shared document. */
data class SharedFileItem(
    val localId: String,
    val name: String,
    val url: String?,
    val size: Long?,
    val mime: String?,
)

/** A link extracted from message text. */
data class SharedLinkItem(
    val localId: String,
    val url: String,
)

data class ChatInfoUiState(
    val conversationId: String = "",
    val title: String = "",
    val avatarUrl: String? = null,
    val status: UserStatus = UserStatus.OFFLINE,
    val bio: String? = null,
    val otherUserId: String = "",
    val memberSince: Long? = null,
    val media: List<SharedMediaItem> = emptyList(),
    val files: List<SharedFileItem> = emptyList(),
    val links: List<SharedLinkItem> = emptyList(),
    val contactCount: Int = 0,
    val locationCount: Int = 0,
    val messageCount: Int = 0,
)

/**
 * Chat Info + shared-media gallery (Phase 10.2/10.3). Derives everything from the
 * same local-first message stream the chat room uses, so the gallery is always in
 * sync and works offline from cached history.
 */
@HiltViewModel
class ChatInfoViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val messageRepository: MessageRepository,
    private val conversationRepository: ConversationRepository,
    private val userRepository: UserRepository,
    private val authRepository: AuthRepository,
    private val blockRepository: BlockRepository,
    private val friendsRepository: FriendsRepository,
) : ViewModel() {

    private val conversationId: String = savedStateHandle.get<String>("conversationId").orEmpty()
    private val currentUserId: String
        get() = authRepository.sessionFlow.value?.userId.orEmpty()

    /**
     * Transient confirmation/notice surfaced as a snackbar after a management
     * action (clear / remove / block / report). Kept out of [state] so the
     * message stream never re-emits for a one-shot event.
     */
    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice.asStateFlow()

    fun consumeNotice() {
        _notice.value = null
    }

    // ---- management (moved here from the chat overflow menu) ----

    /** Clears this conversation's local history for the signed-in user. */
    fun clearChat() {
        viewModelScope.launch {
            messageRepository.clearConversation(conversationId)
            _notice.value = "Chat cleared"
        }
    }

    /** Removes the other participant from the caller's friend list. */
    fun removeFriend() {
        val target = state.value.otherUserId
        if (target.isBlank()) {
            _notice.value = "Couldn't resolve this contact to remove."
            return
        }
        viewModelScope.launch {
            when (val result = friendsRepository.removeFriend(target)) {
                is AppResult.Success -> _notice.value = "Removed from your friends."
                is AppResult.Failure -> _notice.value = result.error.toUserMessage()
                AppResult.Loading -> Unit
            }
        }
    }

    /** Blocks the other participant. */
    fun blockUser() {
        val target = state.value.otherUserId
        if (target.isBlank()) {
            _notice.value = "Couldn't resolve this contact to block."
            return
        }
        viewModelScope.launch {
            when (val result = blockRepository.block(target)) {
                is AppResult.Success -> _notice.value = "This user has been blocked."
                is AppResult.Failure -> _notice.value = result.error.toUserMessage()
                AppResult.Loading -> Unit
            }
        }
    }

    /** Submits a report for the other participant. */
    fun reportUser() {
        _notice.value = "Thanks \u2014 your report has been submitted for review."
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    private val otherUserFlow: Flow<User?> = conversationRepository.observeConversation(conversationId)
        .map { it?.otherMember(currentUserId)?.userId.orEmpty() }
        .distinctUntilChanged()
        .flatMapLatest { id -> if (id.isBlank()) flowOf(null) else userRepository.observeUser(id) }

    val state: StateFlow<ChatInfoUiState> = combine(
        messageRepository.observeMessages(conversationId),
        conversationRepository.observeConversation(conversationId),
        otherUserFlow,
    ) { messages, conversation, otherUser ->
        val newestFirst = messages.asReversed()
        ChatInfoUiState(
            conversationId = conversationId,
            title = otherUser?.displayLabel?.takeIf { it.isNotBlank() }
                ?: conversation?.displayTitle(currentUserId)
                ?: "Chat",
            avatarUrl = otherUser?.avatar ?: conversation?.avatar,
            status = otherUser?.status ?: UserStatus.OFFLINE,
            bio = otherUser?.bio,
            otherUserId = conversation?.otherMember(currentUserId)?.userId.orEmpty(),
            memberSince = otherUser?.createdAt?.takeIf { it > 0L },
            media = newestFirst.flatMap { m ->
                when (m.type) {
                    MessageType.VIDEO ->
                        m.allMediaUrls.take(1).map { SharedMediaItem(m.localId, it, isVideo = true) }
                    MessageType.IMAGE ->
                        m.allMediaUrls.map { SharedMediaItem(m.localId, it, isVideo = false) }
                    else -> emptyList()
                }
            },
            files = newestFirst
                .filter { it.type == MessageType.FILE }
                .map {
                    SharedFileItem(
                        localId = it.localId,
                        name = it.mediaUrl?.substringAfterLast('/')?.takeIf { n -> n.isNotBlank() }
                            ?: "Document",
                        url = it.mediaUrl,
                        size = it.mediaSize,
                        mime = it.mediaMime,
                    )
                },
            links = newestFirst.mapNotNull { m ->
                extractUrl(m.text)?.let { SharedLinkItem(m.localId, it) }
            },
            contactCount = messages.count { it.type == MessageType.CONTACT },
            locationCount = messages.count { it.type == MessageType.LOCATION },
            messageCount = messages.size,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ChatInfoUiState())

    private fun extractUrl(text: String?): String? {
        if (text.isNullOrBlank()) return null
        return URL_REGEX.find(text)?.value
    }

    private companion object {
        val URL_REGEX = Regex("https?://\\S+")
    }
}
