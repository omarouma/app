package app.gagachat.feature.auth.presentation.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LoginUiState(
    val identifier: String = "",
    val password: String = "",
    val identifierError: String? = null,
    val passwordError: String? = null,
    val isSubmitting: Boolean = false,
    val errorMessage: String? = null,
    val isAuthenticated: Boolean = false,
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    fun onIdentifierChange(value: String) {
        _state.update { it.copy(identifier = value, identifierError = null, errorMessage = null) }
    }

    fun onPasswordChange(value: String) {
        _state.update { it.copy(password = value, passwordError = null, errorMessage = null) }
    }

    fun submit() {
        val current = _state.value
        val identifierError = validateIdentifier(current.identifier)
        val passwordError = if (current.password.isBlank()) "Password is required" else null
        if (identifierError != null || passwordError != null) {
            _state.update { it.copy(identifierError = identifierError, passwordError = passwordError) }
            return
        }
        _state.update { it.copy(isSubmitting = true, errorMessage = null) }
        viewModelScope.launch {
            val isEmail = current.identifier.contains("@")
            val result = authRepository.signIn(
                email = if (isEmail) current.identifier.trim() else null,
                phone = if (!isEmail) current.identifier.trim() else null,
                password = current.password,
            )
            when (result) {
                is AppResult.Success -> _state.update { it.copy(isSubmitting = false, isAuthenticated = true) }
                is AppResult.Failure -> _state.update {
                    it.copy(isSubmitting = false, errorMessage = result.error.toUserMessage())
                }
                AppResult.Loading -> Unit
            }
        }
    }

    fun consumeError() = _state.update { it.copy(errorMessage = null) }

    private fun validateIdentifier(value: String): String? {
        val trimmed = value.trim()
        return when {
            trimmed.isEmpty() -> "Email or phone is required"
            trimmed.contains("@") && !android.util.Patterns.EMAIL_ADDRESS.matcher(trimmed).matches() ->
                "Enter a valid email address"
            !trimmed.contains("@") && trimmed.filter { it.isDigit() }.length < 7 ->
                "Enter a valid phone number"
            else -> null
        }
    }
}
