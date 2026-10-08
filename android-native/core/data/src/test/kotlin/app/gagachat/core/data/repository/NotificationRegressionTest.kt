package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.network.dto.NotificationRow
import app.gagachat.core.network.rest.SupabaseRestApi
import app.gagachat.core.network.session.AuthSession
import io.mockk.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NotificationRegressionTest {
    private fun session(id: String) = AuthSession(id, "token-$id", "refresh", Long.MAX_VALUE)
    private fun dispatchers(dispatcher: CoroutineDispatcher) = object : DispatcherProvider {
        override val main = dispatcher
        override val io = dispatcher
        override val default = dispatcher
        override val computation = dispatcher
    }

    @Test fun failedReadAllRetainsUnreadEvidence() = runTest {
        val api = mockk<SupabaseRestApi>()
        val auth = mockk<AuthRepository>()
        val sessions = MutableStateFlow<AuthSession?>(session("a"))
        every { auth.sessionFlow } returns sessions
        coEvery { api.getNotifications("a", any()) } returns listOf(NotificationRow("n", "a", read = false))
        coEvery { api.markAllNotificationsRead("a") } throws IllegalStateException("network failure")
        val repository = DefaultNotificationRepository(api, auth, dispatchers(StandardTestDispatcher(testScheduler)), backgroundScope)
        runCurrent()
        repository.refresh()
        assertTrue(repository.markAllRead() is AppResult.Failure)
        assertEquals(1, repository.unreadCount.value)
        assertFalse(repository.notifications.value.single().read)
    }

    @Test fun accountChangeClearsNotificationsAndRejectsLateRefresh() = runTest {
        val api = mockk<SupabaseRestApi>()
        val auth = mockk<AuthRepository>()
        val sessions = MutableStateFlow<AuthSession?>(session("a"))
        every { auth.sessionFlow } returns sessions
        coEvery { api.getNotifications("a", any()) } returns listOf(NotificationRow("n", "a", read = false))
        val repository = DefaultNotificationRepository(api, auth, dispatchers(StandardTestDispatcher(testScheduler)), backgroundScope)
        runCurrent(); repository.refresh()
        val response = CompletableDeferred<List<NotificationRow>>()
        coEvery { api.getNotifications("a", any()) } coAnswers { response.await() }
        val request = async { repository.refresh() }
        runCurrent()
        sessions.value = session("b"); runCurrent()
        assertTrue(repository.notifications.value.isEmpty())
        assertEquals(0, repository.unreadCount.value)
        response.complete(listOf(NotificationRow("late", "a", read = false)))
        assertTrue(request.await() is AppResult.Failure)
        assertTrue(repository.notifications.value.isEmpty())
    }
}
