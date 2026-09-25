package app.gagachat.feature.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.CoinActivity
import app.gagachat.core.model.CoinActivityType
import app.gagachat.core.ui.component.GagaListRow
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSecondaryButton
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.state.GagaStateHost
import app.gagachat.core.ui.theme.GagaDimens

/** Coin wallet (Master Spec §C): balance, top-up, send, activity. */
@Composable
fun WalletScreen(
    onSendCoins: () -> Unit,
    onBack: () -> Unit,
    viewModel: WalletViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val message by viewModel.topUpMessage.collectAsStateWithLifecycle()

    GagaScaffold(title = "Wallet", onBack = onBack) { padding ->
        GagaStateHost(
            state = state,
            modifier = Modifier.fillMaxSize().padding(padding),
            onRetry = viewModel::refresh,
            emptyIcon = Icons.Filled.AccountBalanceWallet,
            emptyTitle = "No wallet yet",
            emptyDescription = "Your coin balance will appear here.",
        ) { ui ->
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                item { BalanceCard(ui.wallet.formatted) }
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = GagaDimens.space16),
                        horizontalArrangement = Arrangement.spacedBy(GagaDimens.space12),
                    ) {
                        GagaPrimaryButton(
                            text = "Send coins",
                            onClick = onSendCoins,
                            modifier = Modifier.weight(1f),
                            leadingIcon = Icons.Filled.Send,
                        )
                        GagaSecondaryButton(
                            text = "Top up",
                            onClick = { viewModel.topUp(500L) },
                            modifier = Modifier.weight(1f),
                            leadingIcon = Icons.Filled.Add,
                        )
                    }
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
                item { GagaSectionHeader("Activity") }
                if (ui.activity.isEmpty()) {
                    item {
                        Text(
                            text = "No activity yet.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(GagaDimens.space16),
                        )
                    }
                } else {
                    items(ui.activity, key = { it.id }) { entry -> ActivityRow(entry) }
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

@Composable
private fun BalanceCard(balance: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(GagaDimens.space16)
            .clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.primaryContainer)
            .padding(GagaDimens.space24),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.Filled.AccountBalanceWallet,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onPrimaryContainer,
        )
        Spacer(Modifier.height(GagaDimens.space8))
        Text(
            text = balance,
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
        Text(
            text = "GaGa coins",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
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
