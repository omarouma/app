package app.gagachat.feature.qr

import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.*
import app.gagachat.core.model.*
import app.gagachat.core.network.session.AuthSession
import app.gagachat.core.ui.state.ScreenState
import io.mockk.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import org.junit.*
import org.junit.Assert.*

@OptIn(ExperimentalCoroutinesApi::class)
class QrAccountAndFriendTest {
    private val dispatcher = StandardTestDispatcher()
    private val me = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    private val other = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    private fun session(id: String) = AuthSession(id, "token", "refresh", Long.MAX_VALUE)
    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    @Test fun qrReplacesIdentityOnSwitchAndDisappearsOnLogout() = runTest(dispatcher) {
        val sessions = MutableStateFlow<AuthSession?>(session(me))
        val auth = mockk<AuthRepository> { every { sessionFlow } returns sessions }
        val users = mockk<UserRepository>()
        coEvery { users.getUser(any()) } answers { AppResult.Success(User(firstArg(), "Profile")) }
        val vm = MyQrViewModel(auth, users)
        runCurrent()
        assertEquals(QrPayload.encodeUser(me), (vm.state.value as ScreenState.Content<MyQrUi>).data.qrPayload)
        sessions.value = session(other); runCurrent()
        assertEquals(QrPayload.encodeUser(other), (vm.state.value as ScreenState.Content<MyQrUi>).data.qrPayload)
        sessions.value = null; runCurrent()
        assertEquals(ScreenState.SessionExpired, vm.state.value)
        assertEquals("", vm.qrPayload)
    }

    @Test fun scannedProfileFollowsLiveAcceptCancelAndDeclineWithoutRescanning() = runTest(dispatcher) {
        val sessions = MutableStateFlow<AuthSession?>(session(me))
        val auth = mockk<AuthRepository> { every { sessionFlow } returns sessions }
        val users = mockk<UserRepository>()
        coEvery { users.getUser(other) } returns AppResult.Success(User(other, "Friend"))
        val friends = MutableStateFlow<List<Friend>>(emptyList())
        val incoming = MutableStateFlow<List<FriendRequest>>(emptyList())
        val outgoing = MutableStateFlow<List<FriendRequest>>(emptyList())
        val repo = mockk<FriendsRepository>()
        every { repo.friends } returns friends
        every { repo.incomingRequests } returns incoming
        every { repo.outgoingRequests } returns outgoing
        coEvery { repo.refresh() } returns AppResult.Success(Unit)
        coEvery { repo.cancelRequest("out") } coAnswers { outgoing.value = emptyList(); AppResult.Success(Unit) }
        coEvery { repo.declineRequest("in") } coAnswers { incoming.value = emptyList(); AppResult.Success(Unit) }
        val vm = AddByCodeViewModel(users, repo, mockk(), auth)
        runCurrent(); vm.onInputChange(QrPayload.encodeUser(other)); vm.lookup(); runCurrent()
        outgoing.value = listOf(FriendRequest("out", me, other)); runCurrent()
        assertTrue(vm.state.value.requestSent)
        vm.cancelOutgoing(); runCurrent()
        assertFalse(vm.state.value.requestSent)
        incoming.value = listOf(FriendRequest("in", other, me)); runCurrent()
        assertNotNull(vm.state.value.incomingRequest)
        vm.declineIncoming(); runCurrent()
        assertNull(vm.state.value.incomingRequest)
        friends.value = listOf(Friend(User(other, "Friend"))); runCurrent()
        assertTrue(vm.state.value.isFriend)
        sessions.value = null; runCurrent()
        assertNull(vm.state.value.result)
        assertFalse(vm.state.value.isSending)
    }
}
