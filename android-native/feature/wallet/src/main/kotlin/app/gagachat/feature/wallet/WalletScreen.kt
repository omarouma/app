package app.gagachat.feature.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.CoinActivity
import app.gagachat.core.model.CoinActivityType
import app.gagachat.core.model.Wallet
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.state.GagaStateHost
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.theme.GagaGreen
import java.text.DateFormat
import java.util.Date

@Composable
fun WalletScreen(
    onSendCoins: () -> Unit,
    onBack: () -> Unit,
    viewModel: WalletViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val message by viewModel.topUpMessage.collectAsStateWithLifecycle()
    var filter by remember { mutableStateOf("All") }
    var dialog by remember { mutableStateOf<String?>(null) }
    var receipt by remember { mutableStateOf<CoinActivity?>(null) }
    val clipboard = LocalClipboardManager.current
    val accountId = (state as? ScreenState.Content)?.data?.wallet?.userId
    LaunchedEffect(accountId) {
        dialog = null
        receipt = null
        filter = "All"
    }
    GagaScaffold(title = "Wallet", subtitle = "Your global wallet", compactHeader = true, onBack = onBack,
        actions = { IconButton(onClick = viewModel::refresh) { Icon(Icons.Default.Refresh, "Refresh wallet") } },
    ) { padding ->
        GagaStateHost(state = state, modifier = Modifier.fillMaxSize().padding(padding), onRetry = viewModel::refresh,
            emptyIcon = Icons.Default.AccountBalanceWallet, emptyTitle = "Your wallet", emptyDescription = "Refresh to load your account.",
        ) { ui ->
            val activity = ui.activity.filter {
                when (filter) {
                    "Sent" -> it.type in listOf(CoinActivityType.SENT, CoinActivityType.SPEND)
                    "Received" -> it.type in listOf(CoinActivityType.RECEIVED, CoinActivityType.TOPUP, CoinActivityType.REWARD, CoinActivityType.REFUND)
                    else -> true
                }
            }
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                item { BalanceCard(ui.wallet) }
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilledTonalButton(onClick = onSendCoins, modifier = Modifier.weight(1f)) {
                            Icon(Icons.AutoMirrored.Filled.Send, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Send coins")
                        }
                        OutlinedButton(onClick = { dialog = "Receive coins" }, modifier = Modifier.weight(1f)) {
                            Icon(Icons.Default.ArrowDownward, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Receive")
                        }
                    }
                }
                if (message != null) item {
                    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(12.dp)) {
                        Text(message.orEmpty(), Modifier.padding(12.dp), style = MaterialTheme.typography.bodySmall)
                    }
                }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Assets", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        AssetRow("G", "GaGa Coins", "In-app coins", ui.wallet.formatted, "Available", onClick = { dialog = "GaGa Coins" })
                        AssetRow("$", "US Dollar", "USD · Server balance", usdAmount(ui.wallet.usdBalance), "Read only", onClick = { dialog = "US Dollar" })
                        AssetRow("₮", "Tether", "USDT", "Not connected", "Setup needed", onClick = { dialog = "Tether" })
                        AssetRow("$", "USD Coin", "USDC", "Not connected", "Setup needed", onClick = { dialog = "USD Coin" })
                    }
                }
                item {
                    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Global payments", fontWeight = FontWeight.SemiBold)
                            Text("Buy, sell, exchange and withdraw will become available after a supported provider is connected and your eligibility is verified.", style = MaterialTheme.typography.bodySmall)
                            TextButton(onClick = { dialog = "Global payments" }) { Text("View availability") }
                        }
                    }
                }
                item {
                    Column {
                        Text("Coin activity", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text("Latest 100 coin transactions", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("All", "Sent", "Received").forEach { label ->
                                FilterChip(selected = filter == label, onClick = { filter = label }, label = { Text(label) })
                            }
                        }
                    }
                }
                if (activity.isEmpty()) item {
                    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.History, null, Modifier.size(32.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("No ${if (filter == "All") "coin" else filter.lowercase()} activity", Modifier.padding(top = 8.dp), fontWeight = FontWeight.SemiBold)
                        Text("Completed coin transactions appear here.", style = MaterialTheme.typography.bodySmall)
                    }
                }
                items(activity, key = { it.id }) { entry -> TransactionRow(entry) { receipt = entry } }
                item { Text("Balances are loaded from your account. GaGa Coins are separate from USD, USDT and USDC.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            val currentDialog = dialog
            if (currentDialog != null) {
                AlertDialog(onDismissRequest = { dialog = null }, title = { Text(currentDialog) }, text = {
                    Text(when (currentDialog) {
                        "Receive coins" -> "Share your full GaGa account ID with the sender:\n\n${ui.wallet.userId}\n\nThis receives in-app coins only. It is not a blockchain deposit address."
                        "GaGa Coins" -> "Your coin balance and activity are loaded from GaGa. Coins can be sent to another GaGa user. Buying, selling and cash redemption are not available."
                        "US Dollar" -> "This is the USD record held in your GaGa account. It does not confirm bank custody or available withdrawal funds. Deposits, transfers and withdrawals are not connected."
                        "Tether", "USD Coin" -> "No crypto provider or blockchain account is connected. There is no deposit address or confirmed balance. Supported countries, networks, fees and identity verification must be configured before transactions are available."
                        else -> "Coin transfers are available. Fiat funding, payouts, crypto custody, buying, selling and exchange require a supported provider and eligibility verification. Availability will depend on your country."
                    })
                }, confirmButton = { TextButton(onClick = { dialog = null }) { Text("Done") } },
                    dismissButton = { if (currentDialog == "Receive coins") TextButton(onClick = { clipboard.setText(AnnotatedString(ui.wallet.userId)); dialog = null }) { Text("Copy account ID") } })
            }
        }
    }
    receipt?.let { entry ->
        AlertDialog(onDismissRequest = { receipt = null }, title = { Text(activityTitle(entry)) }, text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("${entry.amount} GaGa Coins", style = MaterialTheme.typography.headlineSmall)
                Text("Recorded in your coin ledger")
                if (entry.createdAt > 0) Text(DateFormat.getDateTimeInstance().format(Date(entry.createdAt)))
                entry.note?.takeIf { it.isNotBlank() }?.let { Text(it) }
                Text("Reference\n${entry.id}", style = MaterialTheme.typography.bodySmall)
            }
        }, confirmButton = { TextButton(onClick = { receipt = null }) { Text("Done") } },
            dismissButton = { TextButton(onClick = { clipboard.setText(AnnotatedString(entry.id)) }) { Text("Copy reference") } })
    }
}

private fun usdAmount(value: String?): String = value?.toBigDecimalOrNull()?.let { "$" + it.toPlainString() } ?: "Unavailable"

@Composable
private fun BalanceCard(wallet: Wallet) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp))
        .background(Brush.linearGradient(listOf(GagaGreen, Color(0xFF07594B))))
        .padding(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("GaGa Coins", color = Color.White.copy(alpha = .85f), style = MaterialTheme.typography.labelLarge)
            Icon(Icons.Default.AccountBalanceWallet, null, tint = Color.White)
        }
        Text(wallet.formatted, color = Color.White, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
        Text("In-app balance", color = Color.White.copy(alpha = .85f), style = MaterialTheme.typography.bodySmall)
        HorizontalDivider(color = Color.White.copy(alpha = .2f), modifier = Modifier.padding(vertical = 4.dp))
        Text("${wallet.walletCode} · Coin wallet", color = Color.White, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun AssetRow(symbol: String, title: String, subtitle: String, balance: String, status: String, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainerLow) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.secondaryContainer), contentAlignment = Alignment.Center) {
                Text(symbol, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSecondaryContainer)
            }
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.SemiBold)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Column(horizontalAlignment = Alignment.End, modifier = Modifier.weight(1f)) {
                Text(balance, style = MaterialTheme.typography.titleSmall)
                Text(status, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

private fun activityTitle(entry: CoinActivity): String = when (entry.type) {
    CoinActivityType.SENT -> "Sent coins"
    CoinActivityType.RECEIVED -> "Received coins"
    CoinActivityType.SPEND -> "Coin purchase"
    CoinActivityType.TOPUP -> "Coin top-up"
    CoinActivityType.REWARD -> "Reward"
    CoinActivityType.REFUND -> "Refund"
    CoinActivityType.CONVERT -> "Conversion"
    CoinActivityType.ADJUST -> "Adjustment"
}

@Composable
private fun TransactionRow(entry: CoinActivity, onClick: () -> Unit) {
    val outgoing = entry.type in listOf(CoinActivityType.SENT, CoinActivityType.SPEND)
    val incoming = entry.type in listOf(CoinActivityType.RECEIVED, CoinActivityType.TOPUP, CoinActivityType.REWARD, CoinActivityType.REFUND)
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(if (outgoing) Icons.Default.ArrowUpward else if (incoming) Icons.Default.ArrowDownward else Icons.Default.SwapHoriz, null,
            tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
        Column(Modifier.weight(1f)) {
            Text(activityTitle(entry), fontWeight = FontWeight.Medium)
            Text(if (entry.createdAt > 0) DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(entry.createdAt)) else "Date unavailable", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text("${if (outgoing) "−" else if (incoming) "+" else ""}${entry.amount}", fontWeight = FontWeight.SemiBold)
    }
}
