package app.gagachat.feature.settings.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.NotificationRepository
import app.gagachat.core.model.AppNotification
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
 * In-app notification inbox (Master Spec §C — Notifications). Surfaces the LIVE
 * `notifications` table through [NotificationRepository] so the bell entry point
 * shows real activity instead of a preferences-only screen.
 */
@HiltViewModel
class NotificationInboxViewModel @Inject constructor(
    private val notificationRepository: NotificationRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<ScreenState<List<AppNotification>>>(ScreenState.Initial)
    val state: StateFlow<ScreenState<List<AppNotification>>> = _state.asStateFlow()

    val unreadCount: StateFlow<Int> = notificationRepository.unreadCount

    init {
        refresh()
        // Keep the list live: mark-read / new arrivals update the cached flow.
        viewModelScope.launch {
            notificationRepository.notifications.collectLatest { items ->
                if (_state.value !is ScreenState.Loading) {
                    _state.value = if (items.isEmpty()) ScreenState.Empty else ScreenState.Content(items)
                }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            if (_state.value !is ScreenState.Content) _state.value = ScreenState.Loading
            when (val r = notificationRepository.refresh()) {
                is AppResult.Success -> {
                    val items = notificationRepository.notifications.value
                    _state.value = if (items.isEmpty()) ScreenState.Empty else ScreenState.Content(items)
                }
                is AppResult.Failure -> _state.value = ScreenState.Error(r.error.toUserMessage())
                AppResult.Loading -> Unit
            }
        }
    }

    fun markRead(id: String) = viewModelScope.launch { notificationRepository.markRead(id) }

    fun markAllRead() = viewModelScope.launch { notificationRepository.markAllRead() }
}
