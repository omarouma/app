package app.gagachat.feature.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatarPicker
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaTextField
import app.gagachat.core.ui.theme.GagaDimens

/**
 * Second onboarding step (Master Spec §C): capture the user's display name,
 * handle, bio and avatar so their profile is complete before they reach Home.
 */
@Composable
fun ProfileSetupScreen(
    viewModel: OnboardingViewModel = hiltViewModel(),
    onBack: () -> Unit = {},
    onContinue: () -> Unit = {},
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    GagaScaffold(
        title = "Set up your profile",
        subtitle = "This is how others will see you",
        onBack = onBack,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = GagaDimens.space24, vertical = GagaDimens.space16),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            GagaAvatarPicker(
                imageUrl = state.avatarUrl.ifBlank { null },
                name = state.displayName.ifBlank { "New user" },
                isUploading = state.isUploadingAvatar,
                onImagePicked = viewModel::onAvatarPicked,
                size = 96.dp,
            )

            Spacer(Modifier.height(GagaDimens.space24))

            GagaTextField(
                value = state.displayName,
                onValueChange = viewModel::onDisplayNameChange,
                label = "Display name",
                leadingIcon = Icons.Filled.Person,
                imeAction = ImeAction.Next,
            )
            Spacer(Modifier.height(GagaDimens.space16))

            GagaTextField(
                value = state.username,
                onValueChange = viewModel::onUsernameChange,
                label = "Username",
                leadingIcon = Icons.Filled.AlternateEmail,
                imeAction = ImeAction.Next,
                isError = state.usernameAvailable == false,
                errorText = when {
                    state.isCheckingUsername -> "Checking availability…"
                    state.usernameAvailable == false -> "That username is already taken"
                    else -> null
                },
            )
            if (state.usernameAvailable == true && !state.isCheckingUsername) {
                Spacer(Modifier.height(GagaDimens.space4))
                Text(
                    text = "✓ @${state.username} is available",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Spacer(Modifier.height(GagaDimens.space16))

            GagaTextField(
                value = state.bio,
                onValueChange = viewModel::onBioChange,
                label = "Bio (optional)",
                leadingIcon = Icons.Filled.Badge,
                singleLine = false,
                imeAction = ImeAction.Next,
            )
            Spacer(Modifier.height(GagaDimens.space16))

            GagaTextField(
                value = state.avatarUrl,
                onValueChange = viewModel::onAvatarUrlChange,
                label = "Avatar image URL (optional)",
                leadingIcon = Icons.Filled.Image,
                imeAction = ImeAction.Done,
            )

            if (state.error != null) {
                Spacer(Modifier.height(GagaDimens.space12))
                Text(
                    text = state.error!!,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Spacer(Modifier.height(GagaDimens.space32))

            GagaPrimaryButton(
                text = "Continue",
                onClick = { viewModel.saveProfile(onContinue) },
                modifier = Modifier.fillMaxWidth(),
                loading = state.isSaving,
                enabled = state.displayName.isNotBlank() && state.username.isNotBlank(),
            )

            Spacer(Modifier.height(GagaDimens.space8))
            Text(
                text = "You can change these later in Settings.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
