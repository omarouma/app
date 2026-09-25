package app.gagachat.feature.settings.presentation

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
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaTextField
import app.gagachat.core.ui.theme.GagaDimens

/**
 * "Edit profile" settings screen (Master Spec §C). Lets the signed-in user
 * update their display name, username, bio and avatar, persisting to the
 * `users` table and refreshing the local cache so every surface updates.
 */
@Composable
fun EditProfileScreen(
    onBack: () -> Unit,
    onSaved: () -> Unit,
    viewModel: EditProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    GagaScaffold(title = "Edit profile", onBack = onBack) { padding ->
        if (state.isLoading) {
            GagaLoading(modifier = Modifier.fillMaxSize().padding(padding))
            return@GagaScaffold
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(GagaDimens.space16),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            GagaAvatar(
                imageUrl = state.avatarUrl.ifBlank { null },
                name = state.displayName,
                size = GagaDimens.avatarXLarge,
            )
            Spacer(Modifier.height(GagaDimens.space16))

            GagaTextField(
                value = state.displayName,
                onValueChange = viewModel::onDisplayNameChange,
                label = "Display name",
                leadingIcon = Icons.Filled.Badge,
                imeAction = ImeAction.Next,
            )
            Spacer(Modifier.height(GagaDimens.space12))
            GagaTextField(
                value = state.username,
                onValueChange = viewModel::onUsernameChange,
                label = "Username",
                leadingIcon = Icons.Filled.AlternateEmail,
                imeAction = ImeAction.Next,
            )
            Spacer(Modifier.height(GagaDimens.space12))
            GagaTextField(
                value = state.bio,
                onValueChange = viewModel::onBioChange,
                label = "Bio",
                singleLine = false,
                imeAction = ImeAction.Default,
            )
            Spacer(Modifier.height(GagaDimens.space12))
            GagaTextField(
                value = state.avatarUrl,
                onValueChange = viewModel::onAvatarUrlChange,
                label = "Avatar URL",
                leadingIcon = Icons.Filled.Image,
                imeAction = ImeAction.Done,
            )

            if (state.error != null) {
                Spacer(Modifier.height(GagaDimens.space12))
                Text(
                    text = state.error!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Spacer(Modifier.height(GagaDimens.space24))
            GagaPrimaryButton(
                text = "Save changes",
                onClick = { viewModel.save(onSaved) },
                loading = state.isSaving,
                enabled = state.displayName.isNotBlank(),
            )
            Spacer(Modifier.height(GagaDimens.space8))
            Column(verticalArrangement = Arrangement.Center) {
                Text(
                    text = "Your name and photo are visible to people you chat with.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
