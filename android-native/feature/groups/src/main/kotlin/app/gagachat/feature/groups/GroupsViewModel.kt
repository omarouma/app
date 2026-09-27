package app.gagachat.feature.groups

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.GroupRepository
import app.gagachat.core.model.Group
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Lists the groups the current user belongs to (Master Spec §C). */
@HiltViewModel
class GroupsViewModel @Inject constructor(
    private val groupRepository: GroupRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<ScreenState<List<Group>>>(ScreenState.Initial)
    val state: StateFlow<ScreenState<List<Group>>> = _state.asStateFlow()

    private var loaded = false

    init {
        viewModelScope.launch {
            groupRepository.groups.collect { groups ->
                _state.value = when {
                    groups.isNotEmpty() -> ScreenState.Content(groups)
                    loaded -> ScreenState.Empty
                    else -> _state.value
                }
            }
        }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            if (!loaded) _state.value = ScreenState.Loading
            when (val result = groupRepository.refresh()) {
                is AppResult.Success -> loaded = true
                is AppResult.Failure -> if (!loaded) {
                    _state.value = ScreenState.Error(result.error.toUserMessage(), retryable = true)
                }
                AppResult.Loading -> Unit
            }
        }
    }
}
