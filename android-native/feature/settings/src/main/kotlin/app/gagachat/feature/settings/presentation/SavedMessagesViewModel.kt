package app.gagachat.feature.settings.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.SavedMessagesRepository
import app.gagachat.core.model.SavedMessage
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Saved Messages (Master Spec §C — Profile hub). Surfaces the LIVE
 * `saved_messages` table through [SavedMessagesRepository] so the Profile hub
 * entry shows the user's real bookmarks instead of bouncing back home.
 */
@HiltViewModel
class SavedMessagesViewModel @Inject constructor(
    private val repository: SavedMessagesRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<ScreenState<List<SavedMessage>>>(ScreenState.Initial)
    val state: StateFlow<ScreenState<List<SavedMessage>>> = _state.asStateFlow()

    init {
        refresh()
        viewModelScope.launch {
            repository.savedMessages.collectLatest { items ->
                if (_state.value !is ScreenState.Loading) {
                    _state.value = if (items.isEmpty()) ScreenState.Empty else ScreenState.Content(items)
                }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            if (_state.value !is ScreenState.Content) _state.value = ScreenState.Loading
            when (val r = repository.refresh()) {
                is AppResult.Success -> {
                    val items = repository.savedMessages.value
                    _state.value = if (items.isEmpty()) ScreenState.Empty else ScreenState.Content(items)
                }
                is AppResult.Failure -> _state.value = ScreenState.Error(r.error.toUserMessage())
                AppResult.Loading -> Unit
            }
        }
    }

    fun delete(id: String) = viewModelScope.launch { repository.delete(id) }
}
