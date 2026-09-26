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
 * A single wallet activity entry. The live schema does not yet expose a ledger
 * table, so entries are derived client-side from wallet deltas and stored in a
 * local, per-user activity log (never authoritative for balance).
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
}
