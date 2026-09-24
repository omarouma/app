package app.gagachat.feature.profile.presentation

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.model.User
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileUiState(
    val userId: String = "",
    val user: User? = null,
    val isSelf: Boolean = false,
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val userRepository: UserRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val requestedId: String = savedStateHandle.get<String>("userId").orEmpty()
    private val currentUserId: String = authRepository.sessionFlow.value?.userId.orEmpty()
    private val userId: String = requestedId.ifBlank { currentUserId }

    private val _state = MutableStateFlow(ProfileUiState(userId = userId, isSelf = userId == currentUserId))
    val state: StateFlow<ProfileUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            userRepository.observeUser(userId).collect { user ->
                _state.update { it.copy(user = user, isLoading = false) }
            }
        }
        viewModelScope.launch {
            when (val result = userRepository.refreshUser(userId)) {
                is AppResult.Failure -> _state.update { it.copy(errorMessage = result.error.toUserMessage(), isLoading = false) }
                else -> Unit
            }
        }
    }

    fun consumeError() = _state.update { it.copy(errorMessage = null) }
}
