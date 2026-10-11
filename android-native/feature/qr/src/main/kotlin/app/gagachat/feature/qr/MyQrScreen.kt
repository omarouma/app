package app.gagachat.feature.qr

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaQrCode
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSecondaryButton
import app.gagachat.core.ui.state.GagaStateHost
import app.gagachat.core.ui.theme.GagaDimens
import kotlinx.coroutines.launch

/**
 * Identity-only QR card. Never show fictitious Wallet/Transfer/Group tabs when
 * those actions would actually scan the same user-profile QR.
 */
@Composable
fun MyQrScreen(
    onBack: () -> Unit,
    onShare: (String) -> Unit = {},
    onScan: () -> Unit = {},
    viewModel: MyQrViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    fun notify(text: String) { scope.launch { snackbar.showSnackbar(text) } }

    fun copyLink(link: String) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboard?.setPrimaryClip(ClipData.newPlainText("GaGa profile", link))
        notify("Profile link copied")
    }

    fun shareLink(link: String, name: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, "Connect with $name on GaGa Chat: $link")
            putExtra(Intent.EXTRA_SUBJECT, "GaGa Chat profile")
        }
        runCatching { context.startActivity(Intent.createChooser(intent, "Share GaGa profile")) }
            .onFailure { notify("No app available for sharing.") }
        onShare(link)
    }

    GagaScaffold(title = "My QR Code", onBack = onBack, snackbarHostState = snackbar) { padding ->
        GagaStateHost(
            state = state,
            modifier = Modifier.fillMaxSize().padding(padding),
            onRetry = viewModel::refresh,
            emptyIcon = Icons.Filled.QrCode2,
            emptyTitle = "Sign in to share your profile",
            emptyDescription = "Your QR code becomes available after signing in.",
        ) { ui ->
            val name = ui.user?.displayLabel ?: "GaGa User"
            val username = ui.user?.username
            Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                    .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space12),
                verticalArrangement = Arrangement.spacedBy(GagaDimens.space16),
            ) {
                Text(
                    "Let friends scan this code to find your GaGa profile.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(22.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(GagaDimens.space20),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        GagaAvatar(imageUrl = ui.user?.avatar, name = name, size = 72.dp)
                        Text(name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        if (!username.isNullOrBlank()) {
                            Text("@$username", style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        ui.profileError?.let {
                            Text(it, color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall)
                        }
                        // Keep a high contrast quiet zone around the QR for cameras.
                        GagaQrCode(content = ui.qrPayload, size = 240.dp)
                        Text(
                            "Scan to view profile and request friendship",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(GagaDimens.space12)) {
                    GagaPrimaryButton(
                        text = "Share Profile",
                        onClick = { shareLink(ui.qrPayload, name) },
                        leadingIcon = Icons.Filled.Share,
                        modifier = Modifier.weight(1f),
                    )
                    GagaSecondaryButton(
                        text = "Copy Link",
                        onClick = { copyLink(ui.qrPayload) },
                        leadingIcon = Icons.Filled.ContentCopy,
                        modifier = Modifier.weight(1f),
                    )
                }
                GagaSecondaryButton(
                    text = "Scan Friend's QR",
                    onClick = onScan,
                    leadingIcon = Icons.Filled.QrCodeScanner,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.PersonAdd, contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Scanning a profile never automatically sends a friend request, joins a group, or transfers money.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 12.dp),
                    )
                }
            }
        }
    }
}
