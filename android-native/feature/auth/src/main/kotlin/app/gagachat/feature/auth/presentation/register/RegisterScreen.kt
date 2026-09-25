package app.gagachat.feature.auth.presentation.register

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
import androidx.compose.material.icons.filled.Person
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
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
fun RegisterRoute(
    onAuthenticated: () -> Unit,
    onNavigateBack: () -> Unit,
    onNavigateToOtp: (identifier: String, channel: String) -> Unit,
    viewModel: RegisterViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
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
        onBack = onNavigateBack,
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
            GagaBrandHeader(
                logoSize = 84.dp,
                tagline = "Chat freely, stay connected",
            )
            Spacer(Modifier.height(GagaDimens.space32))

            Text(
                text = "Create your account",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(GagaDimens.space4))
            Text(
                text = "Join GaGa Chat in a few seconds — all you need is an email.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(GagaDimens.space24))

            GagaTextField(
                value = state.displayName,
                onValueChange = viewModel::onDisplayNameChange,
                label = "Display name",
                leadingIcon = Icons.Filled.Person,
                isError = state.displayNameError != null,
                errorText = state.displayNameError,
                imeAction = ImeAction.Next,
            )
            Spacer(Modifier.height(GagaDimens.space16))
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
                imeAction = ImeAction.Next,
            )
            Spacer(Modifier.height(GagaDimens.space16))
            GagaPasswordField(
                value = state.confirmPassword,
                onValueChange = viewModel::onConfirmPasswordChange,
                label = "Confirm password",
                leadingIcon = Icons.Filled.Lock,
                isError = state.confirmPasswordError != null,
                errorText = state.confirmPasswordError,
                imeAction = ImeAction.Done,
            )
            Spacer(Modifier.height(GagaDimens.space24))
            GagaPrimaryButton(
                text = "Create account",
                onClick = viewModel::submit,
                loading = state.isSubmitting,
            )
            Spacer(Modifier.height(GagaDimens.space8))
            GagaTextButton(
                text = "Already have an account? Sign in",
                onClick = onNavigateBack,
            )
            Spacer(Modifier.height(GagaDimens.space16))
            Text(
                text = "By continuing you agree to GaGa's Terms and Privacy Policy.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(GagaDimens.space8))
        }
    }
}
