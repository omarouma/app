package app.gagachat.feature.auth.presentation.login

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
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaBrandHeader
import app.gagachat.core.ui.component.GagaPasswordField
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaTextButton
import app.gagachat.core.ui.component.GagaTextField
import app.gagachat.core.ui.theme.GagaDimens

@Composable
fun LoginRoute(
    onAuthenticated: () -> Unit,
    onNavigateToRegister: () -> Unit,
    onNavigateToOtp: (identifier: String, channel: String) -> Unit,
    viewModel: LoginViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var recoveryVisible by remember { mutableStateOf(false) }
    var recoveryEmail by remember { mutableStateOf("") }
    var recoveryProof by remember { mutableStateOf("") }
    var recoveryPassword by remember { mutableStateOf("") }
    var recoveryConfirmation by remember { mutableStateOf("") }
    if (recoveryVisible) androidx.compose.material3.AlertDialog(
        onDismissRequest = { if (!state.recoveryBusy) { recoveryVisible = false; recoveryProof = ""; recoveryPassword = ""; recoveryConfirmation = "" } },
        title = { Text("Recover your account") },
        text = { Column(Modifier.verticalScroll(rememberScrollState())) {
            GagaTextField(value = recoveryEmail, onValueChange = { recoveryEmail = it }, label = "Email", keyboardType = KeyboardType.Email, enabled = !state.recoveryBusy)
            androidx.compose.material3.TextButton(onClick = { viewModel.requestRecovery(recoveryEmail) }, enabled = !state.recoveryBusy) { Text("Send recovery email") }
            GagaTextField(value = recoveryProof, onValueChange = { recoveryProof = it }, label = "Recovery link or code", enabled = !state.recoveryBusy)
            GagaPasswordField(value = recoveryPassword, onValueChange = { recoveryPassword = it }, label = "New password", enabled = !state.recoveryBusy)
            GagaPasswordField(value = recoveryConfirmation, onValueChange = { recoveryConfirmation = it }, label = "Confirm password", enabled = !state.recoveryBusy)
            state.recoveryNotice?.let { Text(it) }
            if (state.recoveryBusy) Text("Please wait…")
        } },
        confirmButton = { androidx.compose.material3.TextButton(onClick = { viewModel.completeRecovery(recoveryEmail, recoveryProof, recoveryPassword, recoveryConfirmation) }, enabled = !state.recoveryBusy) { Text("Reset password") } },
        dismissButton = { androidx.compose.material3.TextButton(onClick = { recoveryVisible = false; recoveryProof = ""; recoveryPassword = ""; recoveryConfirmation = "" }, enabled = !state.recoveryBusy) { Text("Close") } },
    )
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.isAuthenticated) {
        if (state.isAuthenticated) onAuthenticated()
    }
    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeError()
        }
    }

    GagaScaffold(
        title = "",
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
            Spacer(Modifier.height(GagaDimens.space24))
            GagaBrandHeader(tagline = "Chat freely, stay connected")
            Spacer(Modifier.height(GagaDimens.space32))

            Text(
                text = "Welcome back",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(GagaDimens.space4))
            Text(
                text = "Sign in to continue to GaGa Chat",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(GagaDimens.space24))

            GagaTextField(
                value = state.identifier,
                onValueChange = viewModel::onIdentifierChange,
                label = "Email address",
                leadingIcon = Icons.Filled.Email,
                isError = state.identifierError != null,
                errorText = state.identifierError,
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next,
            )
            Spacer(Modifier.height(GagaDimens.space16))
            GagaPasswordField(
                value = state.password,
                onValueChange = viewModel::onPasswordChange,
                label = "Password",
                leadingIcon = Icons.Filled.Lock,
                isError = state.passwordError != null,
                errorText = state.passwordError,
                imeAction = ImeAction.Done,
            )
            Spacer(Modifier.height(GagaDimens.space24))
            GagaPrimaryButton(
                text = "Sign in",
                onClick = viewModel::submit,
                loading = state.isSubmitting,
            )
            GagaTextButton(text = "Forgot password?", onClick = { recoveryEmail = state.identifier; recoveryVisible = true })
            Spacer(Modifier.height(GagaDimens.space12))
            GagaTextButton(
                text = "Email me a sign-in code instead",
                onClick = {
                    val id = state.identifier.trim()
                    if (id.isNotEmpty()) {
                        onNavigateToOtp(id, "email")
                    }
                },
            )
            Spacer(Modifier.height(GagaDimens.space4))
            GagaTextButton(
                text = "Don't have an account? Create one",
                onClick = onNavigateToRegister,
            )
            Spacer(Modifier.height(GagaDimens.space24))
            Text(
                text = "By continuing you agree to GaGa's Terms and Privacy Policy.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
