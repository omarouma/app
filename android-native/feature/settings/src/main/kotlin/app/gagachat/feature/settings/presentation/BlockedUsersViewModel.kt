package app.gagachat.feature.settings.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.BlockRepository
import app.gagachat.core.model.User
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Blocked-users settings (Master Spec §C). */
@HiltViewModel
class BlockedUsersViewModel @Inject constructor(
    private val blockRepository: BlockRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<ScreenState<List<User>>>(ScreenState.Initial)
    val state: StateFlow<ScreenState<List<User>>> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            if (_state.value !is ScreenState.Content) _state.value = ScreenState.Loading
            when (val r = blockRepository.refresh()) {
                is AppResult.Success -> {
                    val users = blockRepository.resolveUsers()
                    _state.value = if (users.isEmpty()) ScreenState.Empty else ScreenState.Content(users)
                }
                is AppResult.Failure -> _state.value = ScreenState.Error(r.error.toUserMessage())
                AppResult.Loading -> Unit
            }
        }
    }

    fun unblock(userId: String) = viewModelScope.launch {
        blockRepository.unblock(userId)
        refresh()
    }
}
