package app.gagachat.feature.wallet

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.CoinActivity
import app.gagachat.core.model.CoinActivityType
import app.gagachat.core.model.Wallet
import app.gagachat.core.ui.component.GagaListRow
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.state.GagaStateHost
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen
import app.gagachat.core.ui.theme.GagaGreenContainer

/**
 * Coin wallet (Master Spec §C): live balance, wallet id, the actions that are
 * actually wired up (Send Coins + the honest "funding not available yet"
 * notice) and the real activity ledger.
 *
 * Only features backed by a working service are shown here. Withdrawal,
 * conversion, staking, promo redemption, wallet PIN and the other financial
 * actions are intentionally omitted until the underlying services are approved
 * and operational, so the screen never presents a false state.
 */
@Composable
fun WalletScreen(
    onSendCoins: () -> Unit,
    onBack: () -> Unit,
    viewModel: WalletViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val message by viewModel.topUpMessage.collectAsStateWithLifecycle()

    GagaScaffold(
        title = "My Wallet",
        onBack = onBack,
    ) { padding ->
        GagaStateHost(
            state = state,
            modifier = Modifier.fillMaxSize().padding(padding),
            onRetry = viewModel::refresh,
            emptyIcon = Icons.Filled.AccountBalanceWallet,
            emptyTitle = "No wallet yet",
            emptyDescription = "Your coin balance will appear here.",
        ) { ui ->
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                item { WalletHeader(ui.wallet) }
                item { ActionRow(onDeposit = { viewModel.topUp(500L) }, onSend = onSendCoins) }
                item { WalletInfoCard() }
                item { GagaSectionHeader("Recent Transactions") }
                if (ui.activity.isEmpty()) {
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = GagaDimens.space24),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(
                                Icons.Filled.History,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(40.dp),
                            )
                            Spacer(Modifier.height(GagaDimens.space8))
                            Text(
                                text = "No transactions yet",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = "Your coin activity will appear here",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                } else {
                    items(ui.activity, key = { it.id }) { entry -> ActivityRow(entry) }
                }
                if (message != null) {
                    item {
                        Text(
                            text = message!!,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(
                                horizontal = GagaDimens.space16,
                                vertical = GagaDimens.space8,
                            ),
                        )
                    }
                }
                item { Spacer(Modifier.height(GagaDimens.space24)) }
            }
        }
    }

    LaunchedEffect(message) {
        if (message != null) {
            kotlinx.coroutines.delay(2500)
            viewModel.consumeTopUpMessage()
        }
    }
}

/** Green header: live balance and the wallet id (tap to copy). */
@Composable
private fun WalletHeader(wallet: Wallet) {
    val clipboard = LocalClipboardManager.current

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(GagaGreen)
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space20),
    ) {
        Text(
            text = "Gaga Coins balance",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.9f),
        )
        Spacer(Modifier.height(GagaDimens.space4))
        Text(
            text = "${wallet.formatted} GAGA",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = Color.White,
        )
        Spacer(Modifier.height(GagaDimens.space12))
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(50))
                .clickable { clipboard.setText(AnnotatedString(wallet.walletCode)) }
                .padding(vertical = GagaDimens.space4, horizontal = GagaDimens.space4),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "ID: ${wallet.walletCode}",
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.9f),
            )
            Spacer(Modifier.width(GagaDimens.space6))
            Icon(
                Icons.Filled.ContentCopy,
                contentDescription = "Copy wallet ID",
                tint = Color.White,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

/** The only actions that are backed by a working service. */
@Composable
private fun ActionRow(onDeposit: () -> Unit, onSend: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space12),
        horizontalArrangement = Arrangement.spacedBy(GagaDimens.space16),
    ) {
        ActionChip(label = "Send", icon = Icons.AutoMirrored.Filled.Send, onClick = onSend)
        ActionChip(label = "Deposit", icon = Icons.Filled.Add, onClick = onDeposit)
    }
}

@Composable
private fun ActionChip(label: String, icon: ImageVector, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .width(72.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(vertical = GagaDimens.space8),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(GagaGreenContainer),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = label, tint = GagaGreen, modifier = Modifier.size(GagaDimens.iconMedium))
        }
        Spacer(Modifier.height(GagaDimens.space4))
        Text(text = label, style = MaterialTheme.typography.labelSmall)
    }
}

/** Honest explanation of what Gaga Coins are and what is not available yet. */
@Composable
private fun WalletInfoCard() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8)
            .clip(RoundedCornerShape(16.dp))
            .background(GagaGreenContainer)
            .padding(GagaDimens.space16),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            Icons.Filled.Info,
            contentDescription = null,
            tint = GagaGreen,
            modifier = Modifier.size(GagaDimens.iconMedium),
        )
        Spacer(Modifier.width(GagaDimens.space12))
        Column {
            Text(
                text = "About Gaga Coins",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(GagaDimens.space4))
            Text(
                text = "Gaga Coins are used for in-app features. Funding, withdrawals, " +
                    "currency conversion and staking are not available yet.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ActivityRow(entry: CoinActivity) {
    val (icon, sign) = when (entry.type) {
        CoinActivityType.SENT -> Icons.Filled.ArrowUpward to "-"
        CoinActivityType.RECEIVED, CoinActivityType.TOPUP, CoinActivityType.REWARD ->
            Icons.Filled.ArrowDownward to "+"
    }
    val title = when (entry.type) {
        CoinActivityType.SENT -> entry.counterpartyName?.let { "Sent to $it" } ?: "Sent"
        CoinActivityType.RECEIVED -> entry.counterpartyName?.let { "Received from $it" } ?: "Received"
        CoinActivityType.TOPUP -> "Top-up"
        CoinActivityType.REWARD -> "Reward"
    }
    GagaListRow(
        title = title,
        subtitle = entry.note,
        trailing = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(GagaDimens.space4))
                Text(
                    text = "$sign${entry.amount}",
                    style = MaterialTheme.typography.titleMedium,
                )
            }
        },
    )
}
