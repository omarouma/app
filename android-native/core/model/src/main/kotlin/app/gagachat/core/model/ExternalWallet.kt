package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ExternalWallet(
 val id: String,
 @SerialName("user_id") val userId: String,
 val network: String,
 val address: String,
 val label: String,
)

@Serializable
data class ChainAsset(val symbol: String, val name: String, val amount: String, val contract: String? = null)
@Serializable
data class ChainTransaction(val id: String, val confirmed: Boolean)
@Serializable
data class ChainSnapshot(
 val id: String, val network: String, val address: String, val status: String,
 val assets: List<ChainAsset> = emptyList(), val history: List<ChainTransaction> = emptyList(),
 @SerialName("history_status") val historyStatus: String,
 @SerialName("checked_at") val checkedAt: String,
 @SerialName("unavailable_assets") val unavailableAssets: List<String> = emptyList(),
)

object WalletNetworks {
 val labels = linkedMapOf("bsc" to "BNB Smart Chain", "ethereum" to "Ethereum", "bitcoin" to "Bitcoin", "ton" to "TON")
 fun explorer(network: String, address: String): String? = when(network) {
  "bsc" -> "https://bscscan.com/address/$address"
  "ethereum" -> "https://etherscan.io/address/$address"
  "bitcoin" -> "https://mempool.space/address/$address"
  "ton" -> "https://tonviewer.com/$address"
  else -> null
 }
}
