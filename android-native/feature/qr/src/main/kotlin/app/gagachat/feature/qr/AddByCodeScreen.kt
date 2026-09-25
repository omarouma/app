package app.gagachat.feature.qr

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
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
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSecondaryButton
import app.gagachat.core.ui.component.GagaTextField
import app.gagachat.core.ui.theme.GagaDimens

/**
 * "Add by code" (Master Spec §C). Paste or type a GaGa code
 * (`gaga://user/<id>`, a user id, or `@username`) to find someone and add them.
 */
@Composable
fun AddByCodeScreen(
    onOpenChat: (String) -> Unit,
    onBack: () -> Unit,
    viewModel: AddByCodeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    GagaScaffold(title = "Add by code", onBack = onBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(GagaDimens.space16),
        ) {
            Text(
                text = "Enter a GaGa code or @username",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(GagaDimens.space12))
            GagaTextField(
                value = state.input,
                onValueChange = viewModel::onInputChange,
                label = "gaga://user/… or @username",
                leadingIcon = Icons.Filled.QrCodeScanner,
                imeAction = ImeAction.Search,
            )
            Spacer(Modifier.height(GagaDimens.space12))
            GagaPrimaryButton(
                text = "Find",
                onClick = viewModel::lookup,
                modifier = Modifier.fillMaxWidth(),
                enabled = state.input.isNotBlank(),
                loading = state.status == AddByCodeStatus.SEARCHING,
                leadingIcon = Icons.Filled.Search,
            )

            Spacer(Modifier.height(GagaDimens.space24))

            when (state.status) {
                AddByCodeStatus.FOUND -> state.result?.let { user ->
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            GagaAvatar(imageUrl = user.avatar, name = user.displayName, size = 56.dp)
                            Spacer(Modifier.width(GagaDimens.space12))
                            Column {
                                Text(text = user.displayName, style = MaterialTheme.typography.titleMedium)
                                user.username?.let {
                                    Text(
                                        text = "@$it",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(GagaDimens.space16))
                        if (state.isFriend) {
                            GagaSecondaryButton(
                                text = "Open chat",
                                onClick = { viewModel.openChat(onOpenChat) },
                                modifier = Modifier.fillMaxWidth(),
                                leadingIcon = Icons.AutoMirrored.Filled.Chat,
                            )
                        } else if (state.requestSent) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Filled.CheckCircle,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                )
                                Spacer(Modifier.width(GagaDimens.space8))
                                Text(
                                    text = "Friend request sent",
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        } else {
                            GagaPrimaryButton(
                                text = "Add friend",
                                onClick = viewModel::sendRequest,
                                modifier = Modifier.fillMaxWidth(),
                                loading = state.isSending,
                                leadingIcon = Icons.Filled.PersonAdd,
                            )
                        }
                    }
                }
                AddByCodeStatus.NOT_FOUND, AddByCodeStatus.ERROR -> {
                    Text(
                        text = state.error ?: "No user found for that code.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                else -> Unit
            }
        }
    }
}
