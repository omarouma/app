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
import androidx.compose.material.icons.filled.CallSplit
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.RequestPage
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
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
    val message by viewModel.topUpMessage.collectAsStateWithLifecycle()

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
                item { WalletHeader(ui.wallet) }
                item { ActionRow(onDeposit = { viewModel.topUp(500L) }, onSend = onSendCoins) }
                item { ValueCard(ui.wallet) }
                item { StakingCard() }
                item { ActionGrid() }
                item { GagaSectionHeader("Recent Transactions") }
                if (ui.activity.isEmpty()) {
                    item {
                        Text(
                            text = "No transactions yet.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(GagaDimens.space16),
                        )
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

/** Green header: currency tabs, balance, metrics and wallet id. */
@Composable
private fun WalletHeader(wallet: Wallet) {
    val currencies = listOf("GAGA", "USD", "BDT", "RMB", "INR")
    var selected by remember { mutableStateOf("GAGA") }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(GagaGreen)
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space16),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(GagaDimens.space8),
        ) {
            currencies.forEach { currency ->
                CurrencyTab(
                    label = currency,
                    selected = currency == selected,
                    onClick = { selected = currency },
                )
            }
        }
        Spacer(Modifier.height(GagaDimens.space16))
        Text(
            text = "Gaga Coins",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.9f),
        )
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                text = "${wallet.formatted} GAGA",
                style = MaterialTheme.typography.displaySmall,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }
        Text(
            text = "≈ \$0.00 USD",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.9f),
        )
        Spacer(Modifier.height(GagaDimens.space12))
        Row(horizontalArrangement = Arrangement.spacedBy(GagaDimens.space16)) {
            HeaderMetric("0%", "APY")
            HeaderMetric("None", "Tier")
            HeaderMetric("+0", "/day")
        }
        Spacer(Modifier.height(GagaDimens.space12))
        Row(verticalAlignment = Alignment.CenterVertically) {
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
private fun CurrencyTab(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(if (selected) Color.White else Color.White.copy(alpha = 0.2f))
            .clickable(onClick = onClick)
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space6),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = if (selected) GagaGreen else Color.White,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
        )
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
private fun ActionRow(onDeposit: () -> Unit, onSend: () -> Unit) {
    val actions = listOf(
        "Deposit" to Icons.Filled.Add,
        "Withdraw" to Icons.Filled.ArrowUpward,
        "Convert" to Icons.Filled.SwapHoriz,
        "Send" to Icons.Filled.Send,
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
                        else -> Unit
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

@Composable
private fun ValueCard(wallet: Wallet) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space16)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(GagaDimens.space16),
    ) {
        Text("Gaga Coins Value", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(
            "Your total portfolio value",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(GagaDimens.space12))
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                "${wallet.formatted} GAGA",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.width(GagaDimens.space8))
            Text("\$0 USD", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun StakingCard() {
    val tiers = listOf("Bronze", "Silver", "Gold", "Platinum")
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
            Column {
                Text("None Tier", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("0% APY staking reward", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(GagaGreen)
                    .padding(horizontal = GagaDimens.space12, vertical = GagaDimens.space6),
            ) {
                Text("Claim +0", style = MaterialTheme.typography.labelMedium, color = Color.White)
            }
        }
        Spacer(Modifier.height(GagaDimens.space12))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(GagaDimens.space8),
        ) {
            tiers.forEach { tier ->
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(Color.White)
                        .padding(horizontal = GagaDimens.space12, vertical = GagaDimens.space4),
                ) {
                    Text(tier, style = MaterialTheme.typography.labelMedium, color = GagaGreen)
                }
            }
        }
    }
}

@Composable
private fun ActionGrid() {
    val items = listOf(
        "Convert" to Icons.Filled.SwapHoriz,
        "Withdraw" to Icons.Filled.ArrowUpward,
        "Deposit" to Icons.Filled.Add,
        "Send" to Icons.Filled.Send,
        "Request" to Icons.Filled.RequestPage,
        "Split" to Icons.Filled.CallSplit,
        "Promo" to Icons.Filled.Campaign,
        "Security" to Icons.Filled.Security,
    )
    Column(modifier = Modifier.padding(horizontal = GagaDimens.space16)) {
        items.chunked(4).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                row.forEach { (label, icon) -> ActionChip(label = label, icon = icon, onClick = {}) }
            }
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
