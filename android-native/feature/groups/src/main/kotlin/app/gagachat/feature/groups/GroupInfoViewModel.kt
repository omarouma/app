package app.gagachat.feature.groups

import android.content.Context
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.network.NetworkMonitor
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.GroupRepository
import app.gagachat.core.model.Friend
import app.gagachat.core.model.Group
import app.gagachat.core.network.storage.SupabaseStorageApi
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.util.toScreenStateError
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/** Transient state for group mutations (add/remove/leave/delete/edit). */
data class GroupActionState(
    val isBusy: Boolean = false,
    val isUploadingAvatar: Boolean = false,
    val errorMessage: String? = null,
    val noticeMessage: String? = null,
)

/** Group detail: members, add/remove, leave/delete/edit (Master Spec §C). */
@HiltViewModel
class GroupInfoViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val groupRepository: GroupRepository,
    private val networkMonitor: NetworkMonitor,
    private val friendsRepository: FriendsRepository,
    private val authRepository: AuthRepository,
    private val storageApi: SupabaseStorageApi,
    private val dispatchers: DispatcherProvider,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val groupId: String = savedStateHandle.get<String>(GroupsRoutes.ARG_GROUP_ID).orEmpty()

    private val _state = MutableStateFlow<ScreenState<Group>>(ScreenState.Initial)
    val state: StateFlow<ScreenState<Group>> = _state.asStateFlow()

    private val _friends = MutableStateFlow<List<Friend>>(emptyList())
    val friends: StateFlow<List<Friend>> = _friends.asStateFlow()

    private val _action = MutableStateFlow(GroupActionState())
    val action: StateFlow<GroupActionState> = _action.asStateFlow()

    val currentUserId: String get() = authRepository.sessionFlow.value?.userId.orEmpty()

    init {
        refresh()
        viewModelScope.launch {
            friendsRepository.refresh()
            friendsRepository.friends.collect { _friends.value = it }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            if (_state.value !is ScreenState.Content) _state.value = ScreenState.Loading
            when (val result = groupRepository.getGroup(groupId)) {
                is AppResult.Success -> _state.value = ScreenState.Content(result.data)
                is AppResult.Failure -> _state.value = result.error.toScreenStateError(networkMonitor.isCurrentlyOnline())
                AppResult.Loading -> Unit
            }
        }
    }

    fun addMembers(userIds: List<String>) = viewModelScope.launch {
        if (userIds.isEmpty()) return@launch
        _action.update { it.copy(isBusy = true, errorMessage = null) }
        when (val result = groupRepository.addMembers(groupId, userIds)) {
            is AppResult.Success -> {
                _action.update { it.copy(isBusy = false, noticeMessage = "Member added") }
                refresh()
            }
            is AppResult.Failure ->
                _action.update { it.copy(isBusy = false, errorMessage = result.error.toUserMessage()) }
            AppResult.Loading -> Unit
        }
    }

    fun removeMember(userId: String) = viewModelScope.launch {
        _action.update { it.copy(isBusy = true, errorMessage = null) }
        when (val result = groupRepository.removeMember(groupId, userId)) {
            is AppResult.Success -> {
                _action.update { it.copy(isBusy = false, noticeMessage = "Member removed") }
                refresh()
            }
            is AppResult.Failure ->
                _action.update { it.copy(isBusy = false, errorMessage = result.error.toUserMessage()) }
            AppResult.Loading -> Unit
        }
    }

    fun leave(onLeft: () -> Unit) = viewModelScope.launch {
        _action.update { it.copy(isBusy = true, errorMessage = null) }
        when (val result = groupRepository.leaveGroup(groupId)) {
            is AppResult.Success -> {
                _action.update { it.copy(isBusy = false) }
                onLeft()
            }
            is AppResult.Failure ->
                _action.update { it.copy(isBusy = false, errorMessage = result.error.toUserMessage()) }
            AppResult.Loading -> Unit
        }
    }

    fun delete(onDeleted: () -> Unit) = viewModelScope.launch {
        _action.update { it.copy(isBusy = true, errorMessage = null) }
        when (val result = groupRepository.deleteGroup(groupId)) {
            is AppResult.Success -> {
                _action.update { it.copy(isBusy = false) }
                onDeleted()
            }
            is AppResult.Failure ->
                _action.update { it.copy(isBusy = false, errorMessage = result.error.toUserMessage()) }
            AppResult.Loading -> Unit
        }
    }

    /** Saves name/description/avatar edits for the group. */
    fun updateGroup(
        name: String,
        description: String?,
        avatar: String?,
        onSaved: () -> Unit,
    ) = viewModelScope.launch {
        val trimmed = name.trim()
        if (trimmed.isBlank()) {
            _action.update { it.copy(errorMessage = "Group name can't be empty") }
            return@launch
        }
        _action.update { it.copy(isBusy = true, errorMessage = null) }
        when (
            val result = groupRepository.updateGroup(
                groupId = groupId,
                name = trimmed,
                description = description?.trim()?.takeIf { it.isNotBlank() },
                avatar = avatar,
            )
        ) {
            is AppResult.Success -> {
                _action.update { it.copy(isBusy = false, noticeMessage = "Group updated") }
                refresh()
                onSaved()
            }
            is AppResult.Failure ->
                _action.update { it.copy(isBusy = false, errorMessage = result.error.toUserMessage()) }
            AppResult.Loading -> Unit
        }
    }

    /**
     * Uploads a picked image to the public `avatars` bucket under the caller's own
     * folder (so it satisfies the storage RLS policy) and returns the public URL.
     */
    fun uploadAvatar(uri: Uri, onUploaded: (String) -> Unit) {
        val uid = currentUserId
        if (uid.isBlank()) {
            _action.update { it.copy(errorMessage = "Your session has expired. Please sign in again.") }
            return
        }
        viewModelScope.launch {
            _action.update { it.copy(isUploadingAvatar = true, errorMessage = null) }
            val url = withContext(dispatchers.io) {
                runCatching {
                    val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
                    val extension = when {
                        mime.contains("png") -> "png"
                        mime.contains("webp") -> "webp"
                        mime.contains("gif") -> "gif"
                        else -> "jpg"
                    }
                    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: error("Could not read the selected image")
                    storageApi.uploadToBucket(
                        bucket = "avatars",
                        objectPath = "$uid/group-$groupId.$extension",
                        bytes = bytes,
                        mime = mime,
                    )
                }.getOrNull()
            }
            _action.update {
                it.copy(
                    isUploadingAvatar = false,
                    errorMessage = if (url == null) "Could not upload photo. Please try again." else null,
                )
            }
            if (url != null) onUploaded(url)
        }
    }

    fun clearMessages() = _action.update { it.copy(errorMessage = null, noticeMessage = null) }
}
