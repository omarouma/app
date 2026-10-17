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
        coEvery { api.getUnreadNotificationCount("a") } returns 1
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

    @Test fun badgeIncludesUnreadOutsideTheLoadedPage() = runTest {
        val api = mockk<SupabaseRestApi>()
        val auth = mockk<AuthRepository>()
        every { auth.sessionFlow } returns MutableStateFlow<AuthSession?>(session("a"))
        coEvery { api.getNotifications("a", any()) } returns listOf(NotificationRow("n", "a", read = false))
        coEvery { api.getUnreadNotificationCount("a") } returns 83
        val repository = DefaultNotificationRepository(api, auth, dispatchers(StandardTestDispatcher(testScheduler)), backgroundScope)
        runCurrent(); repository.refresh()
        assertEquals(83, repository.unreadCount.value)
        coEvery { api.markAllNotificationsRead("a") } returns Unit
        coEvery { api.getUnreadNotificationCount("a") } returns 1
        assertTrue(repository.markAllRead() is AppResult.Success)
        assertEquals(1, repository.unreadCount.value)
        assertFalse(repository.notifications.value.single().read)
    }

    @Test fun failedDismissKeepsVisibleEvidence() = runTest {
        val api = mockk<SupabaseRestApi>()
        val auth = mockk<AuthRepository>()
        every { auth.sessionFlow } returns MutableStateFlow<AuthSession?>(session("a"))
        coEvery { api.getNotifications("a", any()) } returns listOf(NotificationRow("n", "a", read = false))
        coEvery { api.getUnreadNotificationCount("a") } returns 1
        coEvery { api.dismissNotifications("a", listOf("n")) } throws IllegalStateException("offline")
        val repository = DefaultNotificationRepository(api, auth, dispatchers(StandardTestDispatcher(testScheduler)), backgroundScope)
        runCurrent(); repository.refresh()
        assertTrue(repository.dismiss(listOf("n")) is AppResult.Failure)
        assertEquals("n", repository.notifications.value.single().id)
        assertEquals(1, repository.unreadCount.value)
    }

    @Test fun oldAccountPageCannotPopulateNewAccountInbox() = runTest {
        val api = mockk<SupabaseRestApi>()
        val auth = mockk<AuthRepository>()
        val sessions = MutableStateFlow<AuthSession?>(session("a"))
        every { auth.sessionFlow } returns sessions
        coEvery { api.getNotifications("a", any()) } returns (0 until 50).map { NotificationRow("n$it", "a", read = false) }
        coEvery { api.getUnreadNotificationCount("a") } returns 51
        val response = CompletableDeferred<List<NotificationRow>>()
        coEvery { api.getNotificationsPage("a", 50) } coAnswers { response.await() }
        val repository = DefaultNotificationRepository(api, auth, dispatchers(StandardTestDispatcher(testScheduler)), backgroundScope)
        runCurrent(); repository.refresh()
        assertTrue(repository.hasMore.value)
        val page = async { repository.loadMore() }; runCurrent()
        sessions.value = session("b"); runCurrent()
        response.complete(listOf(NotificationRow("late", "a", read = false)))
        assertTrue(page.await() is AppResult.Failure)
        assertTrue(repository.notifications.value.isEmpty())
        assertFalse(repository.hasMore.value)
    }

    @Test fun accountChangeClearsNotificationsAndRejectsLateRefresh() = runTest {
        val api = mockk<SupabaseRestApi>()
        coEvery { api.getUnreadNotificationCount("a") } returns 1
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
    @Test fun liveRefreshKeepsPreviouslyLoadedHistory() = runTest {
        val api = mockk<SupabaseRestApi>()
        val auth = mockk<AuthRepository>()
        every { auth.sessionFlow } returns MutableStateFlow<AuthSession?>(session("a"))
        val first = (0 until 50).map { NotificationRow("n$it", "a") }
        val older = (50 until 100).map { NotificationRow("n$it", "a") }
        coEvery { api.getNotifications("a", 50) } returns first
        coEvery { api.getNotificationsPage("a", 50) } returns older
        coEvery { api.getNotifications("a", 100) } returns (listOf(NotificationRow("new", "a")) + first + older).take(100)
        coEvery { api.getUnreadNotificationCount("a") } returns 101
        val repo = DefaultNotificationRepository(api, auth, dispatchers(StandardTestDispatcher(testScheduler)), backgroundScope)
        runCurrent(); repo.refresh(); repo.loadMore(); repo.refresh()
        assertEquals(100, repo.notifications.value.size)
        assertEquals("new", repo.notifications.value.first().id)
        assertTrue(repo.notifications.value.any { it.id == "n98" })
        assertEquals(101, repo.unreadCount.value)
    }

}
