package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.model.CoinActivity
import app.gagachat.core.model.CoinActivityType
import app.gagachat.core.model.Wallet
import app.gagachat.core.network.dto.WalletRow
import app.gagachat.core.network.dto.WalletTransactionRow
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Coin wallet (LIVE table `wallets`, one row per user).
 *
 * The balance is authoritative on the server and may only be changed by
 * server-side RPCs. History is read from the append-only `wallet_transactions`
 * ledger (never derived or written client-side), so it survives app restarts,
 * is shared across devices and is auditable.
 */
interface WalletRepository {
    val wallet: StateFlow<Wallet?>
    val activity: StateFlow<List<CoinActivity>>

    suspend fun refresh(): AppResult<Unit>

    /** Ensure a wallet row exists for the current user. */
    suspend fun ensureWallet(): AppResult<Wallet>

    /**
     * Creates a *pending* top-up intent on the server and returns its id.
     *
     * This deliberately does NOT credit the balance. Gaga Coins are only added by
     * the provider-settlement webhook (`credit_wallet_from_settlement`, which is
     * `service_role`-only) after the payment has been verified. The client can
     * never credit itself — there is no client-side balance write path.
     *
     * Not yet wired to a live payment provider; it is the integration point for
     * one. Until a provider is connected, the UI must not claim funding works.
     */
    suspend fun createTopUpIntent(
        amount: Long,
        currency: String = "coins",
        provider: String? = null,
    ): AppResult<String>

    /** Debit the balance (send to a peer). Fails when balance is insufficient. */
    suspend fun sendCoins(toUserId: String, toName: String?, amount: Long, note: String? = null): AppResult<Wallet>
}

@Singleton
class DefaultWalletRepository @Inject constructor(
    private val restApi: SupabaseRestApi,
    private val authRepository: AuthRepository,
    private val dispatchers: DispatcherProvider,
) : WalletRepository {

    private val _wallet = MutableStateFlow<Wallet?>(null)
    override val wallet: StateFlow<Wallet?> = _wallet.asStateFlow()

    private val _activity = MutableStateFlow<List<CoinActivity>>(emptyList())
    override val activity: StateFlow<List<CoinActivity>> = _activity.asStateFlow()

    private val currentUserId: String
        get() = authRepository.sessionFlow.value?.userId.orEmpty()

    override suspend fun refresh(): AppResult<Unit> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized("Not signed in"))
        try {
            loadInto(me)
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun ensureWallet(): AppResult<Wallet> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
        try {
            val existing = restApi.getWallet(me)
            if (existing == null) {
                // Create the row, then reload so balance + ledger are consistent.
                restApi.ensureWallet()
            }
            AppResult.Success(loadInto(me))
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun createTopUpIntent(
        amount: Long,
        currency: String,
        provider: String?,
    ): AppResult<String> = withContext(dispatchers.io) {
        if (amount <= 0) return@withContext AppResult.Failure(AppError.Validation("Amount must be positive"))
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
        try {
            val intentId = restApi.createTopUpIntent(
                amount = amount,
                currency = currency,
                provider = provider,
                idempotencyKey = UUID.randomUUID().toString(),
            )
            AppResult.Success(intentId)
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun sendCoins(
        toUserId: String,
        toName: String?,
        amount: Long,
        note: String?,
    ): AppResult<Wallet> = withContext(dispatchers.io) {
        if (amount <= 0) return@withContext AppResult.Failure(AppError.Validation("Amount must be positive"))
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
        if (me == toUserId) return@withContext AppResult.Failure(AppError.Validation("You can't send coins to yourself"))
        try {
            // Atomic, server-validated transfer. The RPC does the debit + credit in
            // one transaction and returns false when the balance is insufficient.
            // This key deduplicates transport retries of this invocation only.
            // A later invocation currently receives a new key; durable operation
            // identity is required before enabling real-money transfers.
            val moved = restApi.transferCoins(
                toUserId = toUserId,
                amount = amount,
                note = note,
                idempotencyKey = UUID.randomUUID().toString(),
            )
            if (!moved) {
                return@withContext AppResult.Failure(AppError.Validation("Insufficient balance"))
            }
            // Re-read balance + ledger from the server so the UI reflects the
            // committed state (the ledger is the source of truth for history).
            AppResult.Success(loadInto(me))
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    /**
     * Loads the authoritative balance and ledger for [me] into the exposed flows
     * and returns the wallet. History comes from `wallet_transactions`; if that
     * read fails (e.g. a client that ships before the ledger migration is live)
     * it falls back to the legacy jsonb column so the screen is never empty.
     */
    private suspend fun loadInto(me: String): Wallet {
        val row = restApi.getWallet(me)
        val wallet = row?.toDomain() ?: Wallet(id = me, userId = me, coins = 0L)
        _wallet.value = wallet
        _activity.value = runCatching {
            restApi.getWalletTransactions(me).map { it.toActivity() }
        }.getOrElse {
            row?.transactions.orEmpty()
        }.sortedByDescending { it.createdAt }
        return wallet
    }
}

private fun WalletRow.toDomain(): Wallet = Wallet(
    id = id,
    userId = userId,
    coins = coins ?: 0L,
    createdAt = createdAt ?: 0L,
    updatedAt = updatedAt ?: 0L,
)

/**
 * Projects one `wallet_transactions` ledger row into the UI activity model.
 * Ledger [WalletTransactionRow.amount] is always positive; the direction is
 * carried by the `type` string.
 */
private fun WalletTransactionRow.toActivity(): CoinActivity = CoinActivity(
    id = id,
    type = when (type) {
        "transfer_in" -> CoinActivityType.RECEIVED
        "transfer_out" -> CoinActivityType.SENT
        "topup" -> CoinActivityType.TOPUP
        "spend" -> CoinActivityType.SPEND
        "convert" -> CoinActivityType.CONVERT
        "refund" -> CoinActivityType.REFUND
        "challenge", "earn" -> CoinActivityType.REWARD
        else -> CoinActivityType.ADJUST
    },
    amount = amount,
    counterpartyId = relatedUserId,
    // The ledger stores the counterparty id, not the display name; the UI falls
    // back to a generic "Sent"/"Received" label when the name is unknown.
    counterpartyName = null,
    note = description,
    createdAt = createdAt ?: 0L,
)
