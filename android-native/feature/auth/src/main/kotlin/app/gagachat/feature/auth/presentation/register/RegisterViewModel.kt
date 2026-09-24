package app.gagachat.feature.auth.presentation.register

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

data class RegisterUiState(
    val displayName: String = "",
    val identifier: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val displayNameError: String? = null,
    val identifierError: String? = null,
    val passwordError: String? = null,
    val confirmPasswordError: String? = null,
    val isSubmitting: Boolean = false,
    val errorMessage: String? = null,
    val isAuthenticated: Boolean = false,
    val needsOtp: Boolean = false,
)

@HiltViewModel
class RegisterViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(RegisterUiState())
    val state: StateFlow<RegisterUiState> = _state.asStateFlow()

    fun onDisplayNameChange(value: String) = _state.update { it.copy(displayName = value, displayNameError = null) }
    fun onIdentifierChange(value: String) = _state.update { it.copy(identifier = value, identifierError = null) }
    fun onPasswordChange(value: String) = _state.update { it.copy(password = value, passwordError = null) }
    fun onConfirmPasswordChange(value: String) = _state.update { it.copy(confirmPassword = value, confirmPasswordError = null) }

    fun submit() {
        val current = _state.value
        val displayNameError = if (current.displayName.trim().length < 2) "Enter your name" else null
        val identifierError = validateIdentifier(current.identifier)
        val passwordError = if (current.password.length < 6) "Password must be at least 6 characters" else null
        val confirmError = if (current.confirmPassword != current.password) "Passwords do not match" else null
        if (displayNameError != null || identifierError != null || passwordError != null || confirmError != null) {
            _state.update {
                it.copy(
                    displayNameError = displayNameError,
                    identifierError = identifierError,
                    passwordError = passwordError,
                    confirmPasswordError = confirmError,
                )
            }
            return
        }
        _state.update { it.copy(isSubmitting = true, errorMessage = null) }
        viewModelScope.launch {
            val isEmail = current.identifier.contains("@")
            val result = authRepository.signUp(
                email = if (isEmail) current.identifier.trim() else null,
                phone = if (!isEmail) current.identifier.trim() else null,
                password = current.password,
                displayName = current.displayName.trim(),
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
