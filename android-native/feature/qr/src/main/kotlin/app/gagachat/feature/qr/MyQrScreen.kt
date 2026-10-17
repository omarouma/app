package app.gagachat.feature.qr

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.IconButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.CancellationException
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
    var exporting by remember { mutableStateOf(false) }
    val saveQr = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("image/png")) { uri ->
        if (uri != null) scope.launch {
            exporting = true
            try {
                val payload = viewModel.qrPayload
                require(payload.isNotBlank())
                withContext(Dispatchers.IO) {
                    checkNotNull(context.contentResolver.openOutputStream(uri)).use { ProfileQrImage.write(payload, it) }
                }
                snackbar.showSnackbar("QR image saved")
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { snackbar.showSnackbar("Couldn't save QR image. Try again.") }
            finally { exporting = false }
        }
    }

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

    GagaScaffold(title = "My QR Code", onBack = onBack, snackbarHostState = snackbar,
        actions = { IconButton(onClick = viewModel::refresh) { Icon(Icons.Filled.Refresh, "Refresh profile") } }) { padding ->
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
                        BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            GagaQrCode(content = ui.qrPayload, size = minOf(240.dp, maxWidth))
                        }
                        Text(
                            "Scan to view profile and request friendship",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(GagaDimens.space8)) {
                    GagaPrimaryButton(
                        text = "Share Profile",
                        onClick = { shareLink(ui.qrPayload, name) },
                        leadingIcon = Icons.Filled.Share,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    GagaSecondaryButton(
                        text = "Copy Link",
                        onClick = { copyLink(ui.qrPayload) },
                        leadingIcon = Icons.Filled.ContentCopy,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                GagaSecondaryButton(
                    text = if (exporting) "Preparing QR image..." else "Share QR Image",
                    enabled = !exporting,
                    leadingIcon = Icons.Filled.Share,
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        exporting = true
                        scope.launch {
                            try {
                                val payload = ui.qrPayload
                                val uri = ProfileQrImage.shareUri(context, payload)
                                if (viewModel.qrPayload == payload) {
                                    val intent = Intent(Intent.ACTION_SEND).apply {
                                        type = "image/png"
                                        putExtra(Intent.EXTRA_STREAM, uri)
                                        putExtra(Intent.EXTRA_TEXT, payload)
                                        clipData = ClipData.newRawUri("GaGa profile QR", uri)
                                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                    }
                                    context.startActivity(Intent.createChooser(intent, "Share QR image"))
                                }
                            } catch (cancelled: CancellationException) { throw cancelled }
                            catch (_: Exception) { snackbar.showSnackbar("Couldn't share QR image. Try again.") }
                            finally { exporting = false }
                        }
                    },
                )
                GagaSecondaryButton(text = "Save QR Image", enabled = !exporting,
                    leadingIcon = Icons.Filled.Download, modifier = Modifier.fillMaxWidth(),
                    onClick = { saveQr.launch("GaGa-profile-QR.png") })
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
