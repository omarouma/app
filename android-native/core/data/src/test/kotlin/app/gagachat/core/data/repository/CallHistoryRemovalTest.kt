package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.data.preferences.CallHistoryPreferences
import app.gagachat.core.database.dao.CallDao
import app.gagachat.core.database.dao.UserDao
import app.gagachat.core.database.entity.CallSessionEntity
import app.gagachat.core.network.dto.CallHistoryRow
import app.gagachat.core.network.rest.SupabaseRestApi
import app.gagachat.core.network.session.AuthSession
import io.mockk.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class CallHistoryRemovalTest {
    private val dao = mockk<CallDao>(relaxed = true)
    private val users = mockk<UserDao>()
    private val api = mockk<SupabaseRestApi>()
    private val auth = mockk<AuthRepository>()
    private val preferences = mockk<CallHistoryPreferences>()
    private val dispatchers = object : DispatcherProvider {
        override val main = Dispatchers.Unconfined
        override val io = Dispatchers.Unconfined
        override val default = Dispatchers.Unconfined
        override val computation = Dispatchers.Unconfined
    }
    private fun repository(): DefaultCallRepository {
        every { auth.sessionFlow } returns MutableStateFlow(AuthSession("owner", "token", "refresh", Long.MAX_VALUE))
        return DefaultCallRepository(dao, users, api, mockk(), mockk(), auth, mockk<TimeProvider>(), dispatchers, preferences)
    }
    @Test fun failedRefreshIsReportedToTheCaller() = runTest {
        coEvery { preferences.hidden("owner") } returns emptySet()
        coEvery { api.getCallHistory(100) } throws IllegalStateException("offline")
        assertTrue(runCatching { repository().syncHistory() }.isFailure)
    }
    @Test fun hiddenEntryCannotBeRestoredByServerSync() = runTest {
        coEvery { preferences.hidden("owner") } returns setOf("hidden")
        coEvery { api.getCallHistory(100) } returns listOf(CallHistoryRow("hidden", callerId = "owner", calleeId = "peer"))
        repository().syncHistory()
        coVerify(exactly = 1) { api.getCallHistory(100) }
        coVerify(exactly = 0) { dao.upsert(any()) }
    }
    @Test fun failedPreferenceWriteKeepsTheExistingRecord() = runTest {
        coEvery { preferences.hide("owner", setOf("call")) } throws IllegalStateException("disk failure")
        assertTrue(runCatching { repository().deleteCall("call") }.isFailure)
        coVerify(exactly = 0) { dao.deleteById(any()) }
    }
    @Test fun cachedHiddenEntriesAreExcludedFromDisplayedHistory() = runTest {
        every { dao.observeHistory(100) } returns flowOf(listOf(CallSessionEntity("hidden", "chat", "owner", "VOICE", 1, null, "MISSED", "peer", null, null, null, true)))
        every { users.observeAll() } returns flowOf(emptyList())
        every { preferences.observe("owner") } returns flowOf(setOf("hidden"))
        assertTrue(repository().observeHistory().first().isEmpty())
    }
}
