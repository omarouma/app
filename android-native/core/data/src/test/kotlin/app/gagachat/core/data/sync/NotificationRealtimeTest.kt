package app.gagachat.core.data.sync

import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.*
import app.gagachat.core.network.realtime.*
import app.gagachat.core.network.session.AuthSession
import io.mockk.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Test
import kotlinx.coroutines.ExperimentalCoroutinesApi

@OptIn(ExperimentalCoroutinesApi::class)
class NotificationRealtimeTest {
    @Test fun ownEventsAndReconnectRefreshButForeignEventsDoNot() = runTest {
        val events = MutableSharedFlow<RealtimeEvent>()
        val realtime = mockk<SupabaseRealtimeClient>(relaxed = true)
        every { realtime.events } returns events
        val notifications = mockk<NotificationRepository>()
        coEvery { notifications.refresh() } returns AppResult.Success(Unit)
        val auth = mockk<AuthRepository>()
        val session = MutableStateFlow<AuthSession?>(AuthSession("a", "token", "refresh", Long.MAX_VALUE))
        every { auth.sessionFlow } returns session
        val coordinator = RealtimeCoordinator(realtime, mockk(relaxed = true), mockk(relaxed = true), mockk<AppLogger>(relaxed = true), notifications, auth, mockk(relaxed = true))
        coordinator.start(backgroundScope)
        runCurrent()
        verify(exactly = 1) { realtime.subscribe("notifications") }
        events.emit(RealtimeEvent.PostgresChange("notifications", ChangeType.INSERT, buildJsonObject { put("user_id", "b") }, null))
        runCurrent()
        coVerify(exactly = 0) { notifications.refresh() }
        events.emit(RealtimeEvent.PostgresChange("notifications", ChangeType.INSERT, buildJsonObject { put("user_id", "a") }, null))
        runCurrent()
        coVerify(exactly = 1) { notifications.refresh() }
        events.emit(RealtimeEvent.Subscribed("realtime:public:notifications"))
        runCurrent()
        coVerify(exactly = 2) { notifications.refresh() }
        session.value = null
        events.emit(RealtimeEvent.PostgresChange("notifications", ChangeType.INSERT, buildJsonObject { put("user_id", "a") }, null))
        runCurrent()
        coVerify(exactly = 2) { notifications.refresh() }
        coordinator.stop()
        verify(exactly = 1) { realtime.unsubscribe("notifications") }
    }
    @Test fun friendChangesAndReconnectReconcileOnlyActiveParticipants() = runTest {
        val events = MutableSharedFlow<RealtimeEvent>()
        val realtime = mockk<SupabaseRealtimeClient>(relaxed = true)
        every { realtime.events } returns events
        val friends = mockk<FriendsRepository>(relaxed = true)
        val auth = mockk<AuthRepository>()
        val sessions = MutableStateFlow<AuthSession?>(AuthSession("a", "token", "refresh", Long.MAX_VALUE))
        every { auth.sessionFlow } returns sessions
        val coordinator = RealtimeCoordinator(realtime, mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true), auth, friends)
        coordinator.start(backgroundScope); runCurrent()
        verify { realtime.subscribe("friend_requests"); realtime.subscribe("friendships") }
        events.emit(RealtimeEvent.PostgresChange("friend_requests", ChangeType.INSERT, buildJsonObject { put("from_user_id", "b"); put("to_user_id", "c") }, null)); runCurrent()
        coVerify(exactly = 0) { friends.refresh() }
        events.emit(RealtimeEvent.PostgresChange("friend_requests", ChangeType.INSERT, buildJsonObject { put("from_user_id", "b"); put("to_user_id", "a") }, null)); runCurrent()
        coVerify(exactly = 1) { friends.refresh() }
        events.emit(RealtimeEvent.Subscribed("realtime:public:friendships")); runCurrent()
        coVerify(exactly = 2) { friends.refresh() }
        events.emit(RealtimeEvent.PostgresChange("friendships", ChangeType.DELETE, buildJsonObject { put("id", "deleted") }, null)); runCurrent()
        coVerify(exactly = 3) { friends.refresh() }
        sessions.value = null
        events.emit(RealtimeEvent.Subscribed("realtime:public:friend_requests")); runCurrent()
        coVerify(exactly = 3) { friends.refresh() }
        coordinator.stop()
        verify { realtime.unsubscribe("friend_requests"); realtime.unsubscribe("friendships") }
    }

}
