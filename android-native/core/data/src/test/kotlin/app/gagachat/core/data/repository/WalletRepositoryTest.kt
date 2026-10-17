package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.network.dto.WalletRow
import app.gagachat.core.network.rest.SupabaseRestApi
import app.gagachat.core.network.session.AuthSession
import io.mockk.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.runCurrent
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class WalletRepositoryTest {
    private val api = mockk<SupabaseRestApi>()
    private val auth = mockk<AuthRepository>()
    private val session = MutableStateFlow<AuthSession?>(AuthSession("alice", "token", "refresh", Long.MAX_VALUE))
    private val dispatchers = object : DispatcherProvider {
        override val main = Dispatchers.Unconfined
        override val io = Dispatchers.Unconfined
        override val default = Dispatchers.Unconfined
        override val computation = Dispatchers.Unconfined
    }
    init { every { auth.sessionFlow } returns session }

    @Test fun missingWalletUsesServerInitializationAndExactUsdRecord() = runTest {
        val row = WalletRow("wallet", "alice", 42, usdBalance = Json.parseToJsonElement("123456789.12345678"))
        coEvery { api.getWallet("alice") } returnsMany listOf(null, row)
        coEvery { api.ensureWallet() } returns row
        coEvery { api.getWalletTransactions("alice", any()) } returns emptyList()
        val repo = DefaultWalletRepository(api, auth, dispatchers, backgroundScope)
        assertTrue(repo.ensureWallet() is AppResult.Success)
        assertEquals("123456789.12345678", repo.wallet.value?.usdBalance)
        coVerify(exactly = 1) { api.ensureWallet() }
    }

    @Test fun failedLedgerDoesNotPublishAZeroOrLegacyHistory() = runTest {
        coEvery { api.getWallet("alice") } returns WalletRow("wallet", "alice", 42)
        coEvery { api.getWalletTransactions("alice", any()) } throws IllegalStateException("ledger offline")
        val repo = DefaultWalletRepository(api, auth, dispatchers, backgroundScope)
        assertTrue(repo.refresh() is AppResult.Failure)
        assertNull(repo.wallet.value)
        assertTrue(repo.activity.value.isEmpty())
    }

    @Test fun accountSwitchDiscardsInFlightWalletResponse() = runTest {
        coEvery { api.getWallet("alice") } returns WalletRow("wallet", "alice", 42)
        coEvery { api.getWalletTransactions("alice", any()) } coAnswers {
            session.value = AuthSession("bob", "other", "refresh", Long.MAX_VALUE)
            emptyList()
        }
        val repo = DefaultWalletRepository(api, auth, dispatchers, backgroundScope)
        val result = runCatching { repo.refresh() }
        assertTrue(result.exceptionOrNull() is CancellationException)
        assertNull(repo.wallet.value)
    }

    @Test fun logoutClearsPreviouslyLoadedWallet() = runTest {
        coEvery { api.getWallet("alice") } returns WalletRow("wallet", "alice", 42)
        coEvery { api.getWalletTransactions("alice", any()) } returns emptyList()
        val repo = DefaultWalletRepository(api, auth, dispatchers, backgroundScope)
        repo.refresh()
        assertNotNull(repo.wallet.value)
        session.value = null
        runCurrent()
        assertNull(repo.wallet.value)
        assertTrue(repo.activity.value.isEmpty())
    }
}
