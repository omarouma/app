package app.gagachat.feature.profile.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSecondaryButton
import app.gagachat.core.ui.component.GagaSettingsRow
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.util.TimeFormat

@Composable
fun ProfileRoute(
    onNavigateBack: () -> Unit,
    onStartChat: (userId: String) -> Unit,
    onStartCall: (userId: String, isVideo: Boolean) -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeError()
        }
    }

    GagaScaffold(
        title = if (state.isSelf) "My profile" else "Profile",
        onBack = onNavigateBack,
        snackbarHostState = snackbarHostState,
    ) { padding ->
        val user = state.user
        if (state.isLoading && user == null) {
            GagaLoading(modifier = Modifier.padding(padding))
            return@GagaScaffold
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = GagaDimens.space24),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(GagaDimens.space24))
            GagaAvatar(
                imageUrl = user?.avatar,
                name = user?.displayName,
                size = GagaDimens.avatarXLarge,
                status = user?.status,
                showStatus = true,
            )
            Spacer(Modifier.height(GagaDimens.space16))
            Text(
                text = user?.displayName ?: "Unknown",
                style = MaterialTheme.typography.headlineMedium,
                textAlign = TextAlign.Center,
            )
            user?.username?.let {
                Text(
                    text = "@$it",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            user?.bio?.let {
                Spacer(Modifier.height(GagaDimens.space8))
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(Modifier.height(GagaDimens.space24))

            if (!state.isSelf) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(GagaDimens.space12),
                ) {
                    GagaPrimaryButton(
                        text = "Message",
                        onClick = { onStartChat(state.userId) },
                        leadingIcon = Icons.Filled.Chat,
                        modifier = Modifier.weight(1f),
                    )
                    GagaSecondaryButton(
                        text = "Call",
                        onClick = { onStartCall(state.userId, false) },
                        leadingIcon = Icons.Filled.Call,
                        modifier = Modifier.weight(1f),
                    )
                }
                Spacer(Modifier.height(GagaDimens.space8))
                GagaSecondaryButton(
                    text = "Video call",
                    onClick = { onStartCall(state.userId, true) },
                    leadingIcon = Icons.Filled.Videocam,
                )
            }

            Spacer(Modifier.height(GagaDimens.space24))
            GagaDivider()
            user?.phone?.let {
                GagaSettingsRow(title = "Phone", subtitle = it)
                GagaDivider()
            }
            user?.email?.let {
                GagaSettingsRow(title = "Email", subtitle = it)
                GagaDivider()
            }
            user?.lastSeen?.let {
                GagaSettingsRow(title = "Last seen", subtitle = TimeFormat.lastSeen(it))
                GagaDivider()
            }
            Spacer(Modifier.height(GagaDimens.space48))
        }
    }
}
