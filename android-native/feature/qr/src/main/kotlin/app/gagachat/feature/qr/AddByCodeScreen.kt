package app.gagachat.feature.qr

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
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
import kotlinx.coroutines.launch

/**
 * "Add by code" (Master Spec §C). Paste or type a GaGa code
 * (`gaga://user/<id>`, a user id, or `@username`) to find someone and add them.
 */
@Composable
fun AddByCodeScreen(
    onOpenChat: (String) -> Unit,
    startWithCamera: Boolean = false,
    onBack: () -> Unit,
    onOpenProfile: (String) -> Unit = {},
    viewModel: AddByCodeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showScanner by rememberSaveable { mutableStateOf(startWithCamera) }
    var isReadingImage by remember { mutableStateOf(false) }
    var imageError by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            scope.launch {
                isReadingImage = true
                imageError = null
                val code = QrImageDecoder.decode(context, uri)
                isReadingImage = false
                if (code.isNullOrBlank()) {
                    imageError = "No QR code found in that picture. Try another image or use the camera."
                } else {
                    viewModel.onInputChange(code)
                    viewModel.lookup()
                    showScanner = false
                }
            }
        }
    }

    GagaScaffold(title = "Add by code", onBack = onBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(GagaDimens.space16),
        ) {
            Text(
                text = "Scan a GaGa profile code or enter a profile link, GaGa ID or @username. You choose whether to send a friend request.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(GagaDimens.space12))
            GagaSecondaryButton(
                text = if (showScanner) "Hide camera" else "Scan with camera",
                onClick = { showScanner = !showScanner },
                modifier = Modifier.fillMaxWidth(),
                leadingIcon = Icons.Filled.QrCodeScanner,
            )
            Spacer(Modifier.height(GagaDimens.space8))
            GagaSecondaryButton(
                text = if (isReadingImage) "Reading image..." else "Scan QR from Image",
                onClick = { imagePicker.launch("image/*") },
                enabled = !isReadingImage,
                modifier = Modifier.fillMaxWidth(),
                leadingIcon = Icons.Filled.Image,
            )
            imageError?.let {
                Spacer(Modifier.height(GagaDimens.space8))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            if (showScanner) {
                Spacer(Modifier.height(GagaDimens.space12))
                QrCameraScanner(
                    requestPermissionOnOpen = startWithCamera,
                    onCodeScanned = { scanned ->
                        viewModel.onInputChange(scanned)
                        viewModel.lookup()
                        showScanner = false
                    },
                )
            }
            Spacer(Modifier.height(GagaDimens.space12))
            GagaTextField(
                value = state.input,
                onValueChange = viewModel::onInputChange,
                label = "GaGa profile link, user ID or @username",
                leadingIcon = Icons.Filled.QrCodeScanner,
                imeAction = ImeAction.Search,
            )
            Spacer(Modifier.height(GagaDimens.space12))
            GagaPrimaryButton(
                text = "Find",
                onClick = viewModel::lookup,
                modifier = Modifier.fillMaxWidth(),
                enabled = state.input.isNotBlank() && state.status != AddByCodeStatus.SEARCHING,
                loading = state.status == AddByCodeStatus.SEARCHING,
                leadingIcon = Icons.Filled.Search,
            )

            Spacer(Modifier.height(GagaDimens.space24))

            when (state.status) {
                AddByCodeStatus.FOUND -> state.result?.let { user ->
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            GagaAvatar(imageUrl = user.avatar, name = user.displayLabel, size = 56.dp)
                            Spacer(Modifier.width(GagaDimens.space12))
                            Column {
                                Text(text = user.displayLabel, style = MaterialTheme.typography.titleMedium)
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
                                text = "Open Chat",
                                enabled = !state.isSending,
                                loading = state.isSending,
                                onClick = { viewModel.openChat(onOpenChat) },
                                modifier = Modifier.fillMaxWidth(),
                                leadingIcon = Icons.AutoMirrored.Filled.Chat,
                            )
                        } else if (state.incomingRequest != null) {
                            GagaPrimaryButton(
                                text = "Accept Friend Request",
                                onClick = viewModel::acceptIncoming,
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !state.isSending,
                                loading = state.isSending,
                                leadingIcon = Icons.Filled.PersonAdd,
                            )
                            Spacer(Modifier.height(8.dp))
                            GagaSecondaryButton(text = "Decline request", onClick = viewModel::declineIncoming,
                                enabled = !state.isSending, modifier = Modifier.fillMaxWidth())
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
                            Spacer(Modifier.height(8.dp))
                            GagaSecondaryButton(text = "Cancel request", onClick = viewModel::cancelOutgoing,
                                enabled = !state.isSending, loading = state.isSending,
                                modifier = Modifier.fillMaxWidth())
                        } else {
                            GagaPrimaryButton(
                                text = "Add friend",
                                onClick = viewModel::sendRequest,
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !state.isSending,
                                loading = state.isSending,
                                leadingIcon = Icons.Filled.PersonAdd,
                            )
                        }
                        Spacer(Modifier.height(GagaDimens.space12))
                        GagaSecondaryButton(
                            text = "View Profile",
                            onClick = { onOpenProfile(user.id) },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        if (!state.error.isNullOrBlank()) {
                            Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall)
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
