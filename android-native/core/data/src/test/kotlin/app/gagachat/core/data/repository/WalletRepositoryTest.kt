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
    private val requests = mockk<WalletTransferRequestStore>(relaxed = true)
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
        val repo = DefaultWalletRepository(api, auth, dispatchers, backgroundScope, requests)
        assertTrue(repo.ensureWallet() is AppResult.Success)
        assertEquals("123456789.12345678", repo.wallet.value?.usdBalance)
        coVerify(exactly = 1) { api.ensureWallet() }
    }

    @Test fun failedLedgerDoesNotPublishAZeroOrLegacyHistory() = runTest {
        coEvery { api.getWallet("alice") } returns WalletRow("wallet", "alice", 42)
        coEvery { api.getWalletTransactions("alice", any()) } throws IllegalStateException("ledger offline")
        val repo = DefaultWalletRepository(api, auth, dispatchers, backgroundScope, requests)
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
        val repo = DefaultWalletRepository(api, auth, dispatchers, backgroundScope, requests)
        val result = runCatching { repo.refresh() }
        assertTrue(result.exceptionOrNull() is CancellationException)
        assertNull(repo.wallet.value)
    }

    @Test fun logoutClearsPreviouslyLoadedWallet() = runTest {
        coEvery { api.getWallet("alice") } returns WalletRow("wallet", "alice", 42)
        coEvery { api.getWalletTransactions("alice", any()) } returns emptyList()
        val repo = DefaultWalletRepository(api, auth, dispatchers, backgroundScope, requests)
        repo.refresh()
        assertNotNull(repo.wallet.value)
        session.value = null
        runCurrent()
        assertNull(repo.wallet.value)
        assertTrue(repo.activity.value.isEmpty())
    }
    @Test fun uncertainTransferRetainsOperationKeyUntilReconciled() = runTest {
        every { requests.keyFor("alice", "bob", 10, null) } returns "persisted-key"
        coEvery { api.transferCoins("bob", 10, null, "persisted-key") } returns true
        coEvery { api.getWallet("alice") } returns WalletRow("wallet", "alice", 32)
        coEvery { api.getWalletTransactions("alice", any()) } throws IllegalStateException("ledger offline")
        val repo = DefaultWalletRepository(api, auth, dispatchers, backgroundScope, requests)
        assertTrue(repo.sendCoins("bob", "Bob", 10, null) is AppResult.Failure)
        verify(exactly = 0) { requests.complete(any()) }
        coEvery { api.getWalletTransactions("alice", any()) } returns emptyList()
        assertTrue(repo.sendCoins("bob", "Bob", 10, null) is AppResult.Success)
        coVerify(exactly = 2) { api.transferCoins("bob", 10, null, "persisted-key") }
        verify(exactly = 1) { requests.complete("persisted-key") }
    }

    @Test fun cannotSendBeforeRequestIdentityIsPersisted() = runTest {
        every { requests.keyFor(any(), any(), any(), any()) } throws IllegalStateException("disk unavailable")
        val repo = DefaultWalletRepository(api, auth, dispatchers, backgroundScope, requests)
        assertTrue(repo.sendCoins("bob", "Bob", 10, null) is AppResult.Failure)
        coVerify(exactly = 0) { api.transferCoins(any(), any(), any(), any()) }
    }

    @Test fun committedTransferIsNotReportedFailedWhenRequestCleanupFails() = runTest {
        every { requests.keyFor("alice", "bob", 10, null) } returns "persisted-key"
        every { requests.complete("persisted-key") } throws IllegalStateException("disk unavailable")
        coEvery { api.transferCoins("bob", 10, null, "persisted-key") } returns true
        coEvery { api.getWallet("alice") } returns WalletRow("wallet", "alice", 32)
        coEvery { api.getWalletTransactions("alice", any()) } returns emptyList()
        val repo = DefaultWalletRepository(api, auth, dispatchers, backgroundScope, requests)
        assertTrue(repo.sendCoins("bob", "Bob", 10, null) is AppResult.Success)
    }

}
