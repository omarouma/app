package app.gagachat.feature.settings.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val displayName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val notificationsEnabled: Boolean = true,
    val readReceiptsEnabled: Boolean = true,
    val isSigningOut: Boolean = false,
    val signedOut: Boolean = false,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(
        SettingsUiState(
            displayName = authRepository.sessionFlow.value?.displayName,
            email = authRepository.sessionFlow.value?.email,
            phone = authRepository.sessionFlow.value?.phone,
        ),
    )
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()

    fun setNotificationsEnabled(enabled: Boolean) = _state.update { it.copy(notificationsEnabled = enabled) }
    fun setReadReceiptsEnabled(enabled: Boolean) = _state.update { it.copy(readReceiptsEnabled = enabled) }

    fun signOut() {
        _state.update { it.copy(isSigningOut = true) }
        viewModelScope.launch {
            authRepository.signOut()
            _state.update { it.copy(isSigningOut = false, signedOut = true) }
        }
    }
}
