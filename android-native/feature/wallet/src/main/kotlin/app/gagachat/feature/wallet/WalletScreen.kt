package app.gagachat.feature.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Redeem
import androidx.compose.material.icons.filled.RequestPage
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.SwapHoriz
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

/** Coin wallet (Master Spec §C): balance, currency tabs, actions, staking, activity. */
@Composable
fun WalletScreen(
    onSendCoins: () -> Unit,
    onBack: () -> Unit,
    viewModel: WalletViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val notice by viewModel.notice.collectAsStateWithLifecycle()

    GagaScaffold(
        title = "My Wallet",
        onBack = onBack,
        actions = {
            Icon(
                Icons.Filled.Shield,
                contentDescription = "Secured",
                tint = GagaGreen,
                modifier = Modifier.padding(end = GagaDimens.space8),
            )
            Icon(
                Icons.Filled.Lock,
                contentDescription = "Locked",
                tint = GagaGreen,
                modifier = Modifier.padding(end = GagaDimens.space8),
            )
        },
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
                item { WalletHeader(ui.wallet, ui.activity) }
                item {
                    ActionRow(
                        onDeposit = { viewModel.topUp(500L) },
                        onSend = onSendCoins,
                        onUnavailable = viewModel::showNotice,
                    )
                }
                item { StakingCard() }
                item {
                    Column(modifier = Modifier.padding(top = GagaDimens.space8)) {
                        WalletOptionRow(
                            icon = Icons.Filled.Redeem,
                            iconTint = GagaGreen,
                            title = "Redeem Promo Code",
                            subtitle = "Get free Gaga Coins",
                            onClick = { viewModel.showNotice("Promo code redemption is coming soon") },
                        )
                        WalletOptionRow(
                            icon = Icons.Filled.Lock,
                            iconTint = Color(0xFF7E57C2),
                            title = "Wallet Security",
                            subtitle = "Set up PIN protection",
                            onClick = { viewModel.showNotice("Wallet PIN protection is coming soon") },
                        )
                    }
                }
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
                                text = "Start depositing to see your history",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                } else {
                    items(ui.activity, key = { it.id }) { entry -> ActivityRow(entry) }
                }
                if (notice != null) {
                    item {
                        Text(
                            text = notice!!,
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

    LaunchedEffect(notice) {
        if (notice != null) {
            kotlinx.coroutines.delay(2500)
            viewModel.consumeNotice()
        }
    }
}

/**
 * Green header: balance, live activity stats and a copyable wallet id.
 *
 * The wallet is GAGA-only and the server exposes no fiat exchange rate, so the
 * header shows real, derivable figures (received / sent / activity count)
 * instead of placeholder values.
 */
@Composable
private fun WalletHeader(wallet: Wallet, activity: List<CoinActivity>) {
    val clipboard = LocalClipboardManager.current
    val received = activity.filter { it.type != CoinActivityType.SENT }.sumOf { it.amount }
    val sent = activity.filter { it.type == CoinActivityType.SENT }.sumOf { it.amount }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(GagaGreen)
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space16),
    ) {
        Text(
            text = "Gaga Coins",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.9f),
        )
        Text(
            text = "${wallet.formatted} GAGA",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = Color.White,
        )
        Spacer(Modifier.height(GagaDimens.space12))
        Row(horizontalArrangement = Arrangement.spacedBy(GagaDimens.space16)) {
            HeaderMetric("+%,d".format(received), "Received")
            HeaderMetric("-%,d".format(sent), "Sent")
            HeaderMetric(activity.size.toString(), "Activity")
        }
        Spacer(Modifier.height(GagaDimens.space12))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clip(RoundedCornerShape(50))
                .clickable { clipboard.setText(AnnotatedString(wallet.walletCode)) }
                .padding(horizontal = GagaDimens.space4, vertical = GagaDimens.space4),
        ) {
            Text(
                text = "ID: ${wallet.walletCode}",
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.9f),
            )
            Spacer(Modifier.width(GagaDimens.space6))
            Icon(
                Icons.Filled.ContentCopy,
                contentDescription = "Copy wallet id",
                tint = Color.White,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun HeaderMetric(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = Color.White,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = Color.White.copy(alpha = 0.85f),
        )
    }
}

@Composable
private fun ActionRow(
    onDeposit: () -> Unit,
    onSend: () -> Unit,
    onUnavailable: (String) -> Unit,
) {
    val actions = listOf(
        "Deposit" to Icons.Filled.Add,
        "Withdraw" to Icons.Filled.ArrowUpward,
        "Convert" to Icons.Filled.SwapHoriz,
        "Send" to Icons.AutoMirrored.Filled.Send,
        "Request" to Icons.Filled.RequestPage,
        "Earn" to Icons.Filled.Savings,
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space12),
        horizontalArrangement = Arrangement.spacedBy(GagaDimens.space12),
    ) {
        actions.forEach { (label, icon) ->
            ActionChip(
                label = label,
                icon = icon,
                onClick = {
                    when (label) {
                        "Deposit" -> onDeposit()
                        "Send" -> onSend()
                        else -> onUnavailable("$label is coming soon")
                    }
                },
            )
        }
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

/**
 * Staking has no server-side implementation yet, so this card states that
 * plainly rather than showing placeholder APY / tier / reward figures.
 */
@Composable
private fun StakingCard() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space12)
            .clip(RoundedCornerShape(16.dp))
            .background(GagaGreenContainer)
            .padding(GagaDimens.space16),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Staking", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(
                    "Earn rewards on your coins — coming soon",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(GagaGreen)
                    .padding(horizontal = GagaDimens.space12, vertical = GagaDimens.space6),
            ) {
                Text("Soon", style = MaterialTheme.typography.labelMedium, color = Color.White)
            }
        }
    }
}

@Composable
private fun WalletOptionRow(
    icon: ImageVector,
    iconTint: Color,
    title: String,
    subtitle: String,
    onClick: (() -> Unit)? = null,
) {
    GagaListRow(
        title = title,
        subtitle = subtitle,
        onClick = onClick,
        avatar = {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(iconTint.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(20.dp))
            }
        },
        trailing = {
            Icon(
                Icons.Filled.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
    )
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
