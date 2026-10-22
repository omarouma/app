package app.gagachat.core.data.repository

import app.gagachat.core.common.di.ApplicationScope
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
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.serialization.json.jsonPrimitive
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
    @ApplicationScope private val applicationScope: CoroutineScope,
    private val transferRequests: WalletTransferRequestStore,
) : WalletRepository {

    private val _wallet = MutableStateFlow<Wallet?>(null)
    override val wallet: StateFlow<Wallet?> = _wallet.asStateFlow()

    private val _activity = MutableStateFlow<List<CoinActivity>>(emptyList())
    override val activity: StateFlow<List<CoinActivity>> = _activity.asStateFlow()

    @Volatile private var accountEpoch = 0L

    init {
        applicationScope.launch(start = CoroutineStart.UNDISPATCHED) {
            authRepository.sessionFlow.map { it?.userId }.distinctUntilChanged().collect {
                accountEpoch += 1
                _activity.value = emptyList()
                _wallet.value = null
            }
        }
    }

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
            // Persist before the network request. Reuse after an uncertain response,
            // including when the transfer committed but the subsequent reads failed.
            val operationKey = transferRequests.keyFor(me, toUserId, amount, note)
            val moved = restApi.transferCoins(
                toUserId = toUserId,
                amount = amount,
                note = note,
                idempotencyKey = operationKey,
            )
            if (!moved) {
                transferRequests.complete(operationKey)
                return@withContext AppResult.Failure(AppError.Validation("Insufficient balance"))
            }
            // A failed refresh keeps the key, so retrying reconciles the same
            // transfer instead of submitting a second debit.
            val wallet = loadInto(me)
            // The transfer and authoritative reads succeeded. A cleanup failure
            // must not tell the user that the committed transfer failed.
            runCatching { transferRequests.complete(operationKey) }
            AppResult.Success(wallet)
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    /**
     * Loads the authoritative balance and ledger for [me] into the exposed flows
     * and returns the wallet. Ledger failures propagate instead of presenting
     * legacy JSON as current financial history.
     */
    private suspend fun loadInto(me: String): Wallet {
        val epoch = accountEpoch
        val row = restApi.getWallet(me) ?: error("Wallet unavailable. Please refresh.")
        val history = restApi.getWalletTransactions(me).map { it.toActivity() }
            .sortedByDescending { it.createdAt }
        if (currentUserId != me || epoch != accountEpoch) throw CancellationException("Wallet account changed")
        check(row.userId == me) { "Wallet owner mismatch" }
        val wallet = row.toDomain()
        // Publish only after both authoritative reads succeed. Never substitute
        // stale legacy JSON when the ledger cannot be loaded.
        _activity.value = history
        _wallet.value = wallet
        return wallet
    }
}

private fun WalletRow.toDomain(): Wallet = Wallet(
    id = id,
    userId = userId,
    coins = coins ?: 0L,
    createdAt = createdAt ?: 0L,
    updatedAt = updatedAt ?: 0L,
    usdBalance = usdBalance?.jsonPrimitive?.content?.toBigDecimalOrNull()?.toPlainString(),
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
