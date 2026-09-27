package app.gagachat.feature.qr

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaQrCode
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSecondaryButton
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.state.GagaStateHost
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen
import app.gagachat.core.ui.theme.GagaGreenContainer
import kotlinx.coroutines.launch

/** "My QR code" (Master Spec §C): a scannable code that shares your profile. */
@Composable
fun MyQrScreen(
    onBack: () -> Unit,
    onShare: (String) -> Unit = {},
    onScan: () -> Unit = {},
    viewModel: MyQrViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var mode by remember { mutableStateOf(0) } // 0 = My QR, 1 = Scan
    var tab by remember { mutableStateOf(0) }

    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    fun copyToClipboard(label: String, value: String, message: String) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboard?.setPrimaryClip(ClipData.newPlainText(label, value))
        scope.launch { snackbarHostState.showSnackbar(message) }
    }

    fun sharePayload(payload: String, name: String) {
        val text = "Add $name on GaGa Chat: $payload"
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
            putExtra(Intent.EXTRA_SUBJECT, "GaGa Chat")
        }
        val chooser = Intent.createChooser(sendIntent, "Share your GaGa QR").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
        onShare(payload)
    }

    GagaScaffold(
        title = "QR Code",
        onBack = onBack,
        snackbarHostState = snackbarHostState,
    ) { padding ->
        GagaStateHost(
            state = state,
            modifier = Modifier.fillMaxSize().padding(padding),
            onRetry = viewModel::refresh,
            emptyIcon = Icons.Filled.QrCode2,
            emptyTitle = "No profile yet",
            emptyDescription = "Complete your profile to share your QR code.",
        ) { ui ->
            val displayName = ui.user?.displayLabel ?: "GaGa User"
            val avatarUrl = ui.user?.avatar
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState()),
            ) {
                // My QR / Scan segmented toggle
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(GagaDimens.space16),
                    horizontalArrangement = Arrangement.spacedBy(GagaDimens.space12),
                ) {
                    SegmentButton("My QR", mode == 0, Modifier.weight(1f)) { mode = 0 }
                    SegmentButton("Scan", mode == 1, Modifier.weight(1f)) {
                        onScan()
                    }
                }

                // Profile / Transfer / Group / Wallet tabs
                val tabs = listOf("Profile", "Transfer", "Group", "Wallet")
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = GagaDimens.space16),
                    horizontalArrangement = Arrangement.spacedBy(GagaDimens.space8),
                ) {
                    tabs.forEachIndexed { index, label ->
                        TabChip(label, index == tab, Modifier.weight(1f)) { tab = index }
                    }
                }

                Spacer(Modifier.height(GagaDimens.space16))

                // White QR card
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = GagaDimens.space16)
                        .clip(RoundedCornerShape(20.dp))
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(GagaDimens.space20),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    GagaAvatar(imageUrl = avatarUrl, name = displayName, size = 72.dp)
                    Spacer(Modifier.height(GagaDimens.space12))
                    Text(
                        text = displayName,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    ui.profileError?.let { error ->
                        Text(
                            text = error,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    Text(
                        text = subtitleFor(tab),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(GagaDimens.space16))
                    GagaQrCode(content = ui.qrPayload, size = 220.dp)
                    Spacer(Modifier.height(GagaDimens.space16))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .clickable {
                                copyToClipboard("GaGa Wallet ID", ui.walletCode, "Wallet ID copied")
                            }
                            .padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space4),
                    ) {
                        Text(
                            text = "Wallet ID",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.width(GagaDimens.space6))
                        Text(
                            text = ui.walletCode,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.width(GagaDimens.space4))
                        Icon(
                            Icons.Filled.ContentCopy,
                            contentDescription = "Copy wallet id",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                    Spacer(Modifier.height(GagaDimens.space8))
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            text = ui.balance,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            color = GagaGreen,
                        )
                        Spacer(Modifier.width(GagaDimens.space6))
                        Text("GAGA", style = MaterialTheme.typography.labelMedium, color = GagaGreen)
                        Spacer(Modifier.width(GagaDimens.space8))
                        Text(
                            "\$0.00 USD",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                Spacer(Modifier.height(GagaDimens.space16))

                // Share / Copy link
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = GagaDimens.space16),
                    horizontalArrangement = Arrangement.spacedBy(GagaDimens.space12),
                ) {
                    GagaPrimaryButton(
                        text = "Share",
                        onClick = { sharePayload(ui.qrPayload, displayName) },
                        leadingIcon = Icons.Filled.Share,
                        modifier = Modifier.weight(1f),
                    )
                    GagaSecondaryButton(
                        text = "Copy Link",
                        onClick = {
                            copyToClipboard("GaGa QR", ui.qrPayload, "Link copied")
                            onShare(ui.qrPayload)
                        },
                        leadingIcon = Icons.Filled.ContentCopy,
                        modifier = Modifier.weight(1f),
                    )
                }

                Spacer(Modifier.height(GagaDimens.space16))
                GagaSectionHeader("What others can do with your QR")
                HelpRow(Icons.Filled.PersonAdd, "Add you as a friend")
                HelpRow(Icons.Filled.Payments, "Send you Gaga Coins or USD")
                HelpRow(Icons.Filled.Groups, "View your profile or join group")
                Spacer(Modifier.height(GagaDimens.space32))
            }
        }
    }
}

private fun subtitleFor(tab: Int): String = when (tab) {
    0 -> "Scan to add friend"
    1 -> "Scan to send Gaga Coins"
    2 -> "Scan to join my group"
    else -> "Scan to view my wallet"
}

@Composable
private fun SegmentButton(label: String, active: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(if (active) GagaGreen else MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onClick)
            .padding(vertical = GagaDimens.space8),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = if (active) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun TabChip(label: String, active: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(if (active) GagaGreenContainer else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(vertical = GagaDimens.space6),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = if (active) GagaGreen else MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
        )
    }
}

@Composable
private fun HelpRow(icon: ImageVector, text: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(GagaGreenContainer),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = GagaGreen, modifier = Modifier.size(GagaDimens.iconSmall))
        }
        Spacer(Modifier.width(GagaDimens.space12))
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}
