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
    val isSending: Boolean = false,
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

    /** Guards the one-time initial send so re-entering the screen doesn't spam. */
    private var initialSendStarted = false

    fun onCodeChange(value: String) {
        val trimmed = value.trim()
        _state.update { it.copy(code = trimmed, errorMessage = null) }
        // A typed 6-digit code verifies automatically; a pasted link waits for the
        // explicit "Verify" tap (it is far longer than a code).
        if (trimmed.length == 6 && trimmed.all { it.isDigit() }) verify(trimmed)
    }

    /**
     * Sends the sign-in email the first time the screen is shown. Previously the
     * "Email me a sign-in code instead" button only navigated here without ever
     * requesting the email, so nothing was ever delivered.
     */
    fun sendInitial() {
        if (initialSendStarted) return
        initialSendStarted = true
        _state.update { it.copy(isSending = true, errorMessage = null) }
        viewModelScope.launch {
            when (val result = authRepository.sendOtp(email = pendingEmail, phone = pendingPhone)) {
                is AppResult.Success -> {
                    _state.update { it.copy(isSending = false, infoMessage = "We emailed a sign-in link to $identifierLabel") }
                    startCooldown()
                }
                is AppResult.Failure -> _state.update {
                    it.copy(isSending = false, errorMessage = result.error.toUserMessage())
                }
                AppResult.Loading -> Unit
            }
        }
    }

    fun verify(proof: String = _state.value.code) {
        val value = proof.trim()
        if (value.isEmpty()) {
            _state.update { it.copy(errorMessage = "Enter the code or paste the sign-in link") }
            return
        }
        val looksLikeLink = value.contains("://") || value.contains("token=")
        if (!looksLikeLink && value.count { it.isDigit() } < 6) {
            _state.update { it.copy(errorMessage = "Enter the 6-digit code or paste the sign-in link") }
            return
        }
        _state.update { it.copy(isVerifying = true, errorMessage = null) }
        viewModelScope.launch {
            val result = authRepository.verifyEmailOtp(email = pendingEmail, proof = value)
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
            when (val result = authRepository.sendOtp(email = pendingEmail, phone = pendingPhone)) {
                is AppResult.Success -> {
                    _state.update { it.copy(isResending = false, infoMessage = "A new sign-in link was sent") }
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

    private val identifierLabel: String get() = pendingEmail ?: pendingPhone ?: "your email"
}
