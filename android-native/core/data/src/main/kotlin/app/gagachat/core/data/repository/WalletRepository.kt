package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.model.CoinActivity
import app.gagachat.core.model.CoinActivityType
import app.gagachat.core.model.Wallet
import app.gagachat.core.network.dto.WalletInsert
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Coin wallet (LIVE table `wallets`, one row per user).
 *
 * The balance is authoritative on the server. The live schema does not yet
 * expose a ledger table, so a local, in-memory activity log is maintained for
 * the current session to render the "activity" list; it never affects balance.
 */
interface WalletRepository {
    val wallet: StateFlow<Wallet?>
    val activity: StateFlow<List<CoinActivity>>

    suspend fun refresh(): AppResult<Unit>

    /** Ensure a wallet row exists for the current user. */
    suspend fun ensureWallet(): AppResult<Wallet>

    /** Credit the balance (top-up / reward). */
    suspend fun topUp(amount: Long): AppResult<Wallet>

    /** Debit the balance (send to a peer). Fails when balance is insufficient. */
    suspend fun sendCoins(toUserId: String, toName: String?, amount: Long, note: String? = null): AppResult<Wallet>
}

@Singleton
class DefaultWalletRepository @Inject constructor(
    private val restApi: SupabaseRestApi,
    private val authRepository: AuthRepository,
    private val timeProvider: TimeProvider,
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
            val row = restApi.getWallet(me)
            _wallet.value = row?.toDomain() ?: Wallet(id = me, userId = me, coins = 0L)
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun ensureWallet(): AppResult<Wallet> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
        try {
            val existing = restApi.getWallet(me)
            val wallet = existing?.toDomain() ?: run {
                val created = restApi.upsertWallet(WalletInsert(userId = me, coins = 0L))
                created.toDomain()
            }
            _wallet.value = wallet
            AppResult.Success(wallet)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun topUp(amount: Long): AppResult<Wallet> = withContext(dispatchers.io) {
        if (amount <= 0) return@withContext AppResult.Failure(AppError.Validation("Amount must be positive"))
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
        try {
            val current = restApi.getWallet(me)?.coins ?: 0L
            val newBalance = current + amount
            restApi.updateWalletCoins(me, newBalance)
            val wallet = Wallet(id = me, userId = me, coins = newBalance, updatedAt = timeProvider.nowMillis())
            _wallet.value = wallet
            record(CoinActivityType.TOPUP, amount, note = "Top-up")
            AppResult.Success(wallet)
        } catch (t: Throwable) {
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
            val myBalance = restApi.getWallet(me)?.coins ?: 0L
            if (myBalance < amount) {
                return@withContext AppResult.Failure(AppError.Validation("Insufficient balance"))
            }
            // Debit sender, credit recipient (best-effort symmetric transfer).
            restApi.updateWalletCoins(me, myBalance - amount)
            val recipientBalance = restApi.getWallet(toUserId)?.coins ?: 0L
            restApi.updateWalletCoins(toUserId, recipientBalance + amount)
            val wallet = Wallet(id = me, userId = me, coins = myBalance - amount, updatedAt = timeProvider.nowMillis())
            _wallet.value = wallet
            record(CoinActivityType.SENT, amount, counterpartyId = toUserId, counterpartyName = toName, note = note)
            AppResult.Success(wallet)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    private fun record(
        type: CoinActivityType,
        amount: Long,
        counterpartyId: String? = null,
        counterpartyName: String? = null,
        note: String? = null,
    ) {
        val entry = CoinActivity(
            id = "${timeProvider.nowMillis()}_${_activity.value.size}",
            type = type,
            amount = amount,
            counterpartyId = counterpartyId,
            counterpartyName = counterpartyName,
            note = note,
            createdAt = timeProvider.nowMillis(),
        )
        _activity.value = listOf(entry) + _activity.value
    }
}

private fun app.gagachat.core.network.dto.WalletRow.toDomain(): Wallet = Wallet(
    id = id,
    userId = userId,
    coins = coins ?: 0L,
    createdAt = createdAt ?: 0L,
    updatedAt = updatedAt ?: 0L,
)
