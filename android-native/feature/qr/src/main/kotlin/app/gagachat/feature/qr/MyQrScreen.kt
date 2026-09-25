package app.gagachat.feature.qr

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaQrCode
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSecondaryButton
import app.gagachat.core.ui.state.GagaStateHost
import app.gagachat.core.ui.theme.GagaDimens

/** "My QR code" (Master Spec §C): a scannable code that shares your profile. */
@Composable
fun MyQrScreen(
    onBack: () -> Unit,
    onShare: (String) -> Unit,
    viewModel: MyQrViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    GagaScaffold(title = "My QR code", onBack = onBack) { padding ->
        GagaStateHost(
            state = state,
            modifier = Modifier.fillMaxSize().padding(padding),
            onRetry = viewModel::refresh,
            emptyIcon = Icons.Filled.QrCode2,
            emptyTitle = "No profile yet",
            emptyDescription = "Complete your profile to share your QR code.",
        ) { user ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(GagaDimens.space24),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                GagaAvatar(imageUrl = user.avatar, name = user.displayName, size = 96.dp)
                Spacer(Modifier.height(GagaDimens.space12))
                Text(text = user.displayName, style = MaterialTheme.typography.titleLarge)
                user.username?.let {
                    Spacer(Modifier.height(GagaDimens.space4))
                    Text(
                        text = "@$it",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                Spacer(Modifier.height(GagaDimens.space24))
                GagaQrCode(content = viewModel.qrPayload, size = 240.dp)
                Spacer(Modifier.height(GagaDimens.space16))
                Text(
                    text = "Show this code so friends can add you instantly.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(GagaDimens.space24))
                GagaSecondaryButton(
                    text = "Share my code",
                    onClick = { onShare(viewModel.qrPayload) },
                    modifier = Modifier.fillMaxWidth(),
                    leadingIcon = Icons.Filled.Share,
                )
            }
        }
    }
}
