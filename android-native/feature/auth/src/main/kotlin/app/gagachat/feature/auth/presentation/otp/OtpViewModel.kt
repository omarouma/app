package app.gagachat.feature.auth.presentation.otp

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class OtpUiState(
    val code: String = "",
    val isVerifying: Boolean = false,
    val isResending: Boolean = false,
    val errorMessage: String? = null,
    val infoMessage: String? = null,
    val isAuthenticated: Boolean = false,
    val resendCooldownSeconds: Int = 0,
)

@HiltViewModel
class OtpViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(OtpUiState())
    val state: StateFlow<OtpUiState> = _state.asStateFlow()

    fun onCodeChange(value: String) {
        val digits = value.filter { it.isDigit() }.take(6)
        _state.update { it.copy(code = digits, errorMessage = null) }
        if (digits.length == 6) verify(digits)
    }

    fun verify(code: String = _state.value.code) {
        if (code.length < 6) {
            _state.update { it.copy(errorMessage = "Enter the 6-digit code") }
            return
        }
        _state.update { it.copy(isVerifying = true, errorMessage = null) }
        viewModelScope.launch {
            val result = authRepository.verifyOtp(
                email = pendingEmail,
                phone = pendingPhone,
                token = code,
            )
            when (result) {
                is AppResult.Success -> _state.update { it.copy(isVerifying = false, isAuthenticated = true) }
                is AppResult.Failure -> _state.update {
                    it.copy(isVerifying = false, errorMessage = result.error.toUserMessage())
                }
                AppResult.Loading -> Unit
            }
        }
    }

    fun resend() {
        if (_state.value.resendCooldownSeconds > 0) return
        _state.update { it.copy(isResending = true, errorMessage = null) }
        viewModelScope.launch {
            val result = authRepository.sendOtp(email = pendingEmail, phone = pendingPhone)
            when (result) {
                is AppResult.Success -> {
                    _state.update { it.copy(isResending = false, infoMessage = "A new code was sent") }
                    startCooldown()
                }
                is AppResult.Failure -> _state.update {
                    it.copy(isResending = false, errorMessage = result.error.toUserMessage())
                }
                AppResult.Loading -> Unit
            }
        }
    }

    private fun startCooldown() {
        viewModelScope.launch {
            for (s in 30 downTo 1) {
                _state.update { it.copy(resendCooldownSeconds = s) }
                delay(1000)
            }
            _state.update { it.copy(resendCooldownSeconds = 0) }
        }
    }

    fun consumeMessages() = _state.update { it.copy(errorMessage = null, infoMessage = null) }

    // Set by the route before verification.
    var pendingEmail: String? = null
    var pendingPhone: String? = null
}
