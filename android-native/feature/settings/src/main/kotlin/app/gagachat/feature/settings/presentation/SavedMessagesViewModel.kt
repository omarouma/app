package app.gagachat.feature.settings.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.network.NetworkMonitor
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.SavedMessagesRepository
import app.gagachat.core.model.SavedMessage
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.util.toScreenStateError
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SavedMessagesViewModel @Inject constructor(
    private val repository: SavedMessagesRepository,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {
    private val _state = MutableStateFlow<ScreenState<List<SavedMessage>>>(ScreenState.Initial)
    val state = _state.asStateFlow()
    val busy = MutableStateFlow(false)
    val notice = MutableStateFlow<String?>(null)
    fun consumeNotice() { notice.value = null }
    init {
        refresh()
        viewModelScope.launch { repository.savedMessages.collectLatest { items ->
            if (_state.value !is ScreenState.Loading) show(items)
        } }
    }
    private fun show(items: List<SavedMessage>) {
        _state.value = if (items.isEmpty()) ScreenState.Empty else ScreenState.Content(items)
    }
    fun refresh() = viewModelScope.launch {
        if (_state.value !is ScreenState.Content) _state.value = ScreenState.Loading
        when (val result = repository.refresh()) {
            is AppResult.Success -> show(repository.savedMessages.value)
            is AppResult.Failure -> if (repository.savedMessages.value.isNotEmpty()) {
                show(repository.savedMessages.value); notice.value = result.error.toUserMessage()
            } else _state.value = result.error.toScreenStateError(networkMonitor.isCurrentlyOnline())
            AppResult.Loading -> Unit
        }
    }
    fun delete(id: String, done: () -> Unit) = mutate {
        val result = repository.delete(id)
        if (result is AppResult.Success) done()
        result
    }

    private fun mutate(action: suspend () -> AppResult<Unit>) {
        if (busy.value) return
        busy.value = true
        viewModelScope.launch {
            try {
                val result = action()
                if (result is AppResult.Failure) notice.value = result.error.toUserMessage()
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { notice.value = "Couldn't save this change. Try again." }
            finally { busy.value = false }
        }
    }
}
