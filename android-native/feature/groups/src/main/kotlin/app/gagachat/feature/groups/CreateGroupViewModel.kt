package app.gagachat.feature.groups

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.GroupRepository
import app.gagachat.core.model.Friend
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CreateGroupUiState(
    val name: String = "",
    val description: String = "",
    val friends: List<Friend> = emptyList(),
    val selectedIds: Set<String> = emptySet(),
    val isCreating: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class CreateGroupViewModel @Inject constructor(
    private val groupRepository: GroupRepository,
    private val friendsRepository: FriendsRepository,
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
