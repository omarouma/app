package app.gagachat.feature.auth.presentation.recovery

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.auth.PendingRecovery
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.ui.component.GagaPasswordField
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaTextButton
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ResetPasswordUiState(
    val password: String = "",
    val confirmation: String = "",
    val isSubmitting: Boolean = false,
    val isDone: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class ResetPasswordViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ResetPasswordUiState())
    val state: StateFlow<ResetPasswordUiState> = _state.asStateFlow()

    fun onPasswordChange(value: String) = _state.update { it.copy(password = value, errorMessage = null) }
    fun onConfirmationChange(value: String) = _state.update { it.copy(confirmation = value, errorMessage = null) }

    fun submit(token: String) {
        val current = _state.value
        if (token.isBlank()) {
            _state.update { it.copy(errorMessage = "This reset link is no longer valid. Request a new one.") }
            return
        }
        if (current.password.length < 8) {
            _state.update { it.copy(errorMessage = "Use at least 8 characters") }
            return
        }
        if (current.password != current.confirmation) {
            _state.update { it.copy(errorMessage = "Passwords do not match") }
            return
        }
        if (current.isSubmitting) return
        _state.update { it.copy(isSubmitting = true, errorMessage = null) }
        viewModelScope.launch {
            when (val result = authRepository.resetPasswordWithToken(token, current.password)) {
                is AppResult.Success -> _state.update { it.copy(isSubmitting = false, isDone = true) }
                is AppResult.Failure -> _state.update {
                    it.copy(isSubmitting = false, errorMessage = result.error.toUserMessage())
                }
                AppResult.Loading -> Unit
            }
        }
    }
}

/**
 * "Set a new password" surface shown when the user opens the app from a recovery
 * email link. The short-lived token came in through the App Link and is held in
 * [PendingRecovery] until the reset completes.
 */
@Composable
fun ResetPasswordRoute(
    onDone: () -> Unit,
    onCancel: () -> Unit,
    viewModel: ResetPasswordViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val token = remember { PendingRecovery.current }

    LaunchedEffect(state.isDone) { if (state.isDone) onDone() }
    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let { snackbarHostState.showSnackbar(it) }
    }

    GagaScaffold(
        title = "Set a new password",
        onBack = onCancel,
        snackbarHostState = snackbarHostState,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = GagaDimens.space24, vertical = GagaDimens.space16),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Top,
        ) {
            Spacer(Modifier.height(GagaDimens.space16))
            Text(
                text = "Choose a new password",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(GagaDimens.space4))
            Text(
                text = "Your reset link was verified. Enter a new password to finish.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(GagaDimens.space24))
            GagaPasswordField(
                value = state.password,
                onValueChange = viewModel::onPasswordChange,
                label = "New password",
                leadingIcon = Icons.Filled.Lock,
                imeAction = ImeAction.Next,
                enabled = !state.isSubmitting,
            )
            Spacer(Modifier.height(GagaDimens.space16))
            GagaPasswordField(
                value = state.confirmation,
                onValueChange = viewModel::onConfirmationChange,
                label = "Confirm password",
                leadingIcon = Icons.Filled.Lock,
                imeAction = ImeAction.Done,
                enabled = !state.isSubmitting,
            )
            Spacer(Modifier.height(GagaDimens.space24))
            GagaPrimaryButton(
                text = "Set new password",
                onClick = { viewModel.submit(token.orEmpty()) },
                loading = state.isSubmitting,
            )
            Spacer(Modifier.height(GagaDimens.space8))
            GagaTextButton(text = "Back to sign in", onClick = onCancel, enabled = !state.isSubmitting)
            Spacer(Modifier.height(GagaDimens.space8))
            Text(
                text = "Tip: if this link has expired, go back and request a new one from \u201cForgot password?\u201d.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
