package app.gagachat.feature.groups

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.GroupRepository
import app.gagachat.core.model.Friend
import app.gagachat.core.network.session.SessionStore
import app.gagachat.core.network.storage.SupabaseStorageApi
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

data class CreateGroupUiState(
    val name: String = "",
    val description: String = "",
    val avatarUrl: String? = null,
    val isUploadingAvatar: Boolean = false,
    val friends: List<Friend> = emptyList(),
    val selectedIds: Set<String> = emptySet(),
    val isCreating: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class CreateGroupViewModel @Inject constructor(
    private val groupRepository: GroupRepository,
    private val friendsRepository: FriendsRepository,
    private val storageApi: SupabaseStorageApi,
    private val sessionStore: SessionStore,
    private val dispatchers: DispatcherProvider,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val _state = MutableStateFlow(CreateGroupUiState())
    val state: StateFlow<CreateGroupUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            friendsRepository.refresh()
        }
        viewModelScope.launch {
            friendsRepository.friends.collect { friends ->
                _state.update { it.copy(friends = friends) }
            }
        }
    }

    fun onNameChange(value: String) = _state.update { it.copy(name = value, error = null) }
    fun onDescriptionChange(value: String) = _state.update { it.copy(description = value, error = null) }

    fun toggleMember(userId: String) = _state.update {
        val next = if (it.selectedIds.contains(userId)) it.selectedIds - userId else it.selectedIds + userId
        it.copy(selectedIds = next)
    }

    /**
     * Uploads the picked image to the public `avatars` bucket under the caller's
     * own folder (so it satisfies the storage RLS policy) and stores the public
     * URL. The group photo is applied when the group is created.
     */
    fun onAvatarPicked(uri: Uri) {
        val uid = sessionStore.userId()
        if (uid == null) {
            _state.update { it.copy(error = "Your session has expired. Please sign in again.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isUploadingAvatar = true, error = null) }
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
                        objectPath = "$uid/group_avatar_${System.currentTimeMillis()}.$extension",
                        bytes = bytes,
                        mime = mime,
                    )
                }.getOrNull()
            }
            _state.update {
                it.copy(
                    isUploadingAvatar = false,
                    avatarUrl = url ?: it.avatarUrl,
                    error = if (url == null) "Could not upload photo. Please try again." else null,
                )
            }
        }
    }

    fun create(onCreated: (String) -> Unit) {
        val snapshot = _state.value
        if (snapshot.name.isBlank()) {
            _state.update { it.copy(error = "Please enter a group name") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isCreating = true, error = null) }
            when (val result = groupRepository.createGroup(
                name = snapshot.name,
                description = snapshot.description.ifBlank { null },
                memberIds = snapshot.selectedIds.toList(),
                avatar = snapshot.avatarUrl,
            )) {
                is AppResult.Success -> {
                    _state.update { it.copy(isCreating = false) }
                    onCreated(result.data.id)
                }
                is AppResult.Failure -> _state.update {
                    it.copy(isCreating = false, error = result.error.toUserMessage())
                }
                AppResult.Loading -> Unit
            }
        }
    }
}
