package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The user's coin wallet (LIVE table `wallets`). One row per user.
 */
@Serializable
data class Wallet(
    val id: String,
    @SerialName("user_id") val userId: String,
    val coins: Long = 0L,
    @SerialName("created_at") val createdAt: Long = 0L,
    @SerialName("updated_at") val updatedAt: Long = 0L,
    /** Exact server USD record, not proof of provider custody or withdrawability. */
    val usdBalance: String? = null,
) {
    /** Coins are stored as integers; formatted for display. */
    val formatted: String get() = "%,d".format(coins)

    /**
     * Short, human-readable wallet code shown in the UI (e.g. `GC-2AARB3B`).
     * Derived deterministically from the wallet id so it stays stable.
     */
    val walletCode: String get() = "GC-" + id.replace("-", "").take(6).uppercase()
}

/**
 * A single wallet activity entry, projected from one row of the append-only
 * `wallet_transactions` ledger (the authoritative source of wallet history).
 * The ledger is written exclusively by server-side RPCs; the client only reads
 * it. [amount] is always positive — direction is encoded by [type].
 */
@Serializable
data class CoinActivity(
    val id: String,
    val type: CoinActivityType,
    val amount: Long,
    @SerialName("counterparty_id") val counterpartyId: String? = null,
    @SerialName("counterparty_name") val counterpartyName: String? = null,
    val note: String? = null,
    @SerialName("created_at") val createdAt: Long = 0L,
)

@Serializable
enum class CoinActivityType {
    @SerialName("received") RECEIVED,
    @SerialName("sent") SENT,
    @SerialName("topup") TOPUP,
    @SerialName("reward") REWARD,
    @SerialName("spend") SPEND,
    @SerialName("convert") CONVERT,
    @SerialName("adjust") ADJUST,
    @SerialName("refund") REFUND,
}
