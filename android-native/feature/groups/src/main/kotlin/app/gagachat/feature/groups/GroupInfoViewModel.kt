package app.gagachat.feature.groups

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.GroupRepository
import app.gagachat.core.model.Friend
import app.gagachat.core.model.Group
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Group detail: members, add/remove, leave/delete (Master Spec §C). */
@HiltViewModel
class GroupInfoViewModel @Inject constructor(
    private val groupRepository: GroupRepository,
    private val friendsRepository: FriendsRepository,
    private val authRepository: AuthRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val groupId: String = savedStateHandle.get<String>(GroupsRoutes.ARG_GROUP_ID).orEmpty()

    private val _state = MutableStateFlow<ScreenState<Group>>(ScreenState.Initial)
    val state: StateFlow<ScreenState<Group>> = _state.asStateFlow()

    private val _friends = MutableStateFlow<List<Friend>>(emptyList())
    val friends: StateFlow<List<Friend>> = _friends.asStateFlow()

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
                is AppResult.Failure -> _state.value = ScreenState.Error(result.error.toUserMessage())
                AppResult.Loading -> Unit
            }
        }
    }

    fun addMembers(userIds: List<String>) = viewModelScope.launch {
        if (userIds.isEmpty()) return@launch
        groupRepository.addMembers(groupId, userIds)
        refresh()
    }

    fun removeMember(userId: String) = viewModelScope.launch {
        groupRepository.removeMember(groupId, userId)
        refresh()
    }

    fun leave(onLeft: () -> Unit) = viewModelScope.launch {
        groupRepository.leaveGroup(groupId)
        onLeft()
    }

    fun delete(onDeleted: () -> Unit) = viewModelScope.launch {
        groupRepository.deleteGroup(groupId)
        onDeleted()
    }
}
