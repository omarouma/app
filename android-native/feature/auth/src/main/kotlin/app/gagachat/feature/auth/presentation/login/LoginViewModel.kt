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
            // Email/password is the supported credential on this backend. Phone
            // sign-in is validated out earlier so we only ever send an email here.
            val result = authRepository.signIn(
                email = current.identifier.trim(),
                phone = null,
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

    /**
     * The backend currently only enables the email provider, so we validate for a
     * real email address and give phone-number typers a clear, actionable message
     * instead of letting the request fail with a cryptic provider error.
     */
    private fun validateIdentifier(value: String): String? {
        val trimmed = value.trim()
        return when {
            trimmed.isEmpty() -> "Email address is required"
            looksLikePhone(trimmed) ->
                "Phone sign-in isn't available yet — please use your email address."
            !android.util.Patterns.EMAIL_ADDRESS.matcher(trimmed).matches() ->
                "Enter a valid email address"
            else -> null
        }
    }

    private fun looksLikePhone(value: String): Boolean {
        if (value.contains("@")) return false
        val digits = value.count { it.isDigit() }
        val others = value.count { it == '+' || it == '-' || it == ' ' || it == '(' || it == ')' }
        return digits >= 7 && (digits + others) == value.length
    }
}
