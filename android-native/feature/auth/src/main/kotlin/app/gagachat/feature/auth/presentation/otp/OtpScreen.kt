package app.gagachat.feature.auth.presentation.otp

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MarkEmailRead
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaTextButton
import app.gagachat.core.ui.theme.GagaDimens

@Composable
fun OtpRoute(
    identifier: String,
    channel: String,
    onAuthenticated: () -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: OtpViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    // Phone verification is disabled on the backend, so only the email channel is
    // ever a valid destination. Anything else renders an explanatory guard below.
    val isEmailChannel = channel == "email"

    LaunchedEffect(identifier, channel) {
        if (isEmailChannel) {
            viewModel.pendingEmail = identifier
            // Actually request the email: the previous build only navigated here.
            viewModel.sendInitial()
        } else {
            viewModel.pendingPhone = identifier
        }
    }
    LaunchedEffect(state.isAuthenticated) {
        if (state.isAuthenticated) onAuthenticated()
    }
    LaunchedEffect(state.errorMessage, state.infoMessage) {
        (state.errorMessage ?: state.infoMessage)?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeMessages()
        }
    }

    GagaScaffold(
        title = "Verify code",
        onBack = onNavigateBack,
        snackbarHostState = snackbarHostState,
    ) { padding ->
        if (!isEmailChannel) {
            PhoneUnavailableContent(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                onNavigateBack = onNavigateBack,
            )
            return@GagaScaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = GagaDimens.space24, vertical = GagaDimens.space16),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Top,
        ) {
            Spacer(Modifier.height(GagaDimens.space24))
            Icon(
                imageVector = Icons.Filled.MarkEmailRead,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.height(56.dp),
            )
            Spacer(Modifier.height(GagaDimens.space16))
            Text(
                text = "Check your email",
                style = MaterialTheme.typography.headlineSmall,
            )
            Spacer(Modifier.height(GagaDimens.space8))
            Text(
                text = "We sent a sign-in link to $identifier. Open the email and tap the link, " +
                    "or paste the link (or code) below.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(GagaDimens.space32))
            OutlinedTextField(
                value = state.code,
                onValueChange = viewModel::onCodeChange,
                label = { Text("Sign-in link or code") },
                singleLine = true,
                isError = state.errorMessage != null,
                shape = MaterialTheme.shapes.medium,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Text,
                    imeAction = ImeAction.Done,
                ),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(GagaDimens.space24))
            GagaPrimaryButton(
                text = if (state.isSending) "Sending link\u2026" else "Verify",
                onClick = { viewModel.verify() },
                loading = state.isVerifying || state.isSending,
                enabled = state.code.isNotBlank(),
            )
            Spacer(Modifier.height(GagaDimens.space8))
            GagaTextButton(
                text = if (state.resendCooldownSeconds > 0) {
                    "Resend in ${state.resendCooldownSeconds}s"
                } else {
                    "Resend email"
                },
                onClick = viewModel::resend,
                enabled = state.resendCooldownSeconds == 0 && !state.isResending,
            )
        }
    }
}

/**
 * Shown when the OTP route is reached for a channel the backend does not support
 * (phone/SMS). Gives the user a clear, non-dead-end path back to email sign-in.
 */
@Composable
private fun PhoneUnavailableContent(
    modifier: Modifier = Modifier,
    onNavigateBack: () -> Unit,
) {
    Column(
        modifier = modifier.verticalScroll(rememberScrollState()).padding(horizontal = GagaDimens.space24, vertical = GagaDimens.space16),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Filled.MarkEmailRead,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.height(56.dp),
        )
        Spacer(Modifier.height(GagaDimens.space16))
        Text(
            text = "Phone verification isn't available yet",
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(GagaDimens.space8))
        Text(
            text = "Please go back and sign in with your email address instead.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(GagaDimens.space24))
        GagaPrimaryButton(
            text = "Back to sign in",
            onClick = onNavigateBack,
        )
    }
}
