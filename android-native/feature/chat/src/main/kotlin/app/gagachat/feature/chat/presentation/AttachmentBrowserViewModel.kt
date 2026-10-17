package app.gagachat.feature.chat.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.SavedMessagesRepository
import app.gagachat.core.model.User
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AttachmentBrowserViewModel @Inject constructor(
    private val auth: AuthRepository,
    private val friends: FriendsRepository,
    private val saved: SavedMessagesRepository,
) : ViewModel() {
    private val _contacts = MutableStateFlow<List<User>>(emptyList())
    val contacts = _contacts.asStateFlow()
    val error = MutableStateFlow<String?>(null)
    val loading = MutableStateFlow(false)
    val favorites = combine(auth.sessionFlow, saved.savedMessages) { session, rows ->
        rows.filter { it.userId == session?.userId }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init {
        viewModelScope.launch {
            auth.sessionFlow.map { it?.userId }.distinctUntilChanged().collectLatest { owner ->
                _contacts.value = emptyList()
                if (!owner.isNullOrBlank()) refreshOwner(owner)
            }
        }
    }

    fun refresh() = viewModelScope.launch {
        auth.sessionFlow.value?.userId?.let { refreshOwner(it) }
    }

    private suspend fun refreshOwner(owner: String) {
        loading.value = true
        error.value = null
        val friendResult = friends.refresh()
        val savedResult = saved.refresh()
        if (owner != auth.sessionFlow.value?.userId) return
        _contacts.value = friends.friends.value.map { it.user }.filter { it.id != owner }
        if (friendResult is AppResult.Failure || savedResult is AppResult.Failure)
            error.value = "Couldn't refresh everything. Retry when connected."
        loading.value = false
    }
}
