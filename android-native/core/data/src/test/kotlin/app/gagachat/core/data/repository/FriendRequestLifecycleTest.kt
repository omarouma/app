package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.model.FriendRequestStatus
import app.gagachat.core.network.dto.FriendRequestRpcResult
import app.gagachat.core.network.rest.SupabaseRestApi
import app.gagachat.core.network.session.AuthSession
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.plugins.ResponseException
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpStatusCode
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Friend-request lifecycle behaviour (FR-02..FR-06, FR-08).
 *
 * The atomic RPCs are the primary path so both accounts observe the same state;
 * the legacy multi-call path is retained only as a rollout fallback and is proven
 * to (a) trigger only on the "function not deployed" signal and (b) send the
 * canonical "rejected" status the backend guard actually accepts.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class FriendRequestLifecycleTest {

    private fun session(id: String) = AuthSession(id, "token-$id", "refresh", Long.MAX_VALUE)

    private fun dispatchers(d: CoroutineDispatcher) = object : DispatcherProvider {
        override val main = d
        override val io = d
        override val default = d
        override val computation = d
    }

    private fun buildRepo(
        api: SupabaseRestApi,
        auth: AuthRepository,
        users: UserRepository,
        d: CoroutineDispatcher,
        scope: CoroutineScope,
    ) = DefaultFriendsRepository(
        restApi = api,
        authRepository = auth,
        userRepository = users,
        timeProvider = mockk<TimeProvider>(relaxed = true),
        dispatchers = dispatchers(d),
        scope = scope,
    )

    private fun stubEmptyRefresh(api: SupabaseRestApi) {
        coEvery { api.getFriendships(any()) } returns emptyList()
        coEvery { api.getFriendRequests(any()) } returns emptyList()
    }

    /** A genuine PostgREST "function not found" transport failure (HTTP 404 + PGRST202). */
    private fun missingRpcException(): ResponseException {
        val response = mockk<HttpResponse>(relaxed = true)
        every { response.status } returns HttpStatusCode.NotFound
        return ClientRequestException(
            response,
            """{"code":"PGRST202","message":"Could not find the function public.gaga_accept_friend_request(p_request_id) in the schema cache"}""",
        )
    }

    @Test fun acceptUsesAtomicRpcAndNeverTouchesLegacyPath() = runTest {
        val api = mockk<SupabaseRestApi>()
        val auth = mockk<AuthRepository>()
        val users = mockk<UserRepository>(relaxed = true)
        every { auth.sessionFlow } returns MutableStateFlow(session("me"))
        stubEmptyRefresh(api)
        coEvery { api.acceptFriendRequestRpc("req-1") } returns
            FriendRequestRpcResult(status = "accepted", requestId = "req-1", friendId = "them")

        val repo = buildRepo(api, auth, users, StandardTestDispatcher(testScheduler), backgroundScope)
        runCurrent()

        assertTrue(repo.acceptRequest("req-1", "them") is AppResult.Success)
        coVerify(exactly = 1) { api.acceptFriendRequestRpc("req-1") }
        coVerify(exactly = 0) { api.updateFriendRequestStatus(any(), any()) }
        coVerify(exactly = 0) { api.insertFriendship(any()) }
    }

    @Test fun acceptSurfacesDomainRejectionAsFailure() = runTest {
        val api = mockk<SupabaseRestApi>()
        val auth = mockk<AuthRepository>()
        val users = mockk<UserRepository>(relaxed = true)
        every { auth.sessionFlow } returns MutableStateFlow(session("me"))
        stubEmptyRefresh(api)
        coEvery { api.acceptFriendRequestRpc("req-1") } returns
            FriendRequestRpcResult(error = "REQUEST_NOT_PENDING", status = "accepted")

        val repo = buildRepo(api, auth, users, StandardTestDispatcher(testScheduler), backgroundScope)
        runCurrent()

        val result = repo.acceptRequest("req-1", "them")
        assertTrue(result is AppResult.Failure)
        assertTrue((result as AppResult.Failure).error is AppError.Validation)
        coVerify(exactly = 0) { api.updateFriendRequestStatus(any(), any()) }
    }

    @Test fun declineUsesAtomicRpc() = runTest {
        val api = mockk<SupabaseRestApi>()
        val auth = mockk<AuthRepository>()
        val users = mockk<UserRepository>(relaxed = true)
        every { auth.sessionFlow } returns MutableStateFlow(session("me"))
        stubEmptyRefresh(api)
        coEvery { api.declineFriendRequestRpc("req-2") } returns FriendRequestRpcResult(status = "rejected")

        val repo = buildRepo(api, auth, users, StandardTestDispatcher(testScheduler), backgroundScope)
        runCurrent()

        assertTrue(repo.declineRequest("req-2") is AppResult.Success)
        coVerify(exactly = 1) { api.declineFriendRequestRpc("req-2") }
        coVerify(exactly = 0) { api.updateFriendRequestStatus(any(), any()) }
    }

    @Test fun cancelUsesAtomicRpc() = runTest {
        val api = mockk<SupabaseRestApi>()
        val auth = mockk<AuthRepository>()
        val users = mockk<UserRepository>(relaxed = true)
        every { auth.sessionFlow } returns MutableStateFlow(session("me"))
        stubEmptyRefresh(api)
        coEvery { api.cancelFriendRequestRpc("req-3") } returns FriendRequestRpcResult(status = "cancelled")

        val repo = buildRepo(api, auth, users, StandardTestDispatcher(testScheduler), backgroundScope)
        runCurrent()

        assertTrue(repo.cancelRequest("req-3") is AppResult.Success)
        coVerify(exactly = 1) { api.cancelFriendRequestRpc("req-3") }
        coVerify(exactly = 0) { api.updateFriendRequestStatus(any(), any()) }
    }

    @Test fun acceptFallsBackToLegacyWhenRpcMissing() = runTest {
        val api = mockk<SupabaseRestApi>()
        val auth = mockk<AuthRepository>()
        val users = mockk<UserRepository>(relaxed = true)
        every { auth.sessionFlow } returns MutableStateFlow(session("me"))
        stubEmptyRefresh(api)
        coEvery { api.acceptFriendRequestRpc("req-1") } throws missingRpcException()
        coEvery { api.updateFriendRequestStatus("req-1", "accepted") } returns Unit
        coEvery { api.insertFriendship(any()) } returns Unit

        val repo = buildRepo(api, auth, users, StandardTestDispatcher(testScheduler), backgroundScope)
        runCurrent()

        assertTrue(repo.acceptRequest("req-1", "them") is AppResult.Success)
        coVerify(exactly = 1) { api.updateFriendRequestStatus("req-1", "accepted") }
        coVerify(exactly = 2) { api.insertFriendship(any()) }
    }

    @Test fun declineFallbackSendsCanonicalRejectedStatus() = runTest {
        val api = mockk<SupabaseRestApi>()
        val auth = mockk<AuthRepository>()
        val users = mockk<UserRepository>(relaxed = true)
        every { auth.sessionFlow } returns MutableStateFlow(session("me"))
        stubEmptyRefresh(api)
        coEvery { api.declineFriendRequestRpc("req-2") } throws missingRpcException()
        coEvery { api.updateFriendRequestStatus("req-2", "rejected") } returns Unit

        val repo = buildRepo(api, auth, users, StandardTestDispatcher(testScheduler), backgroundScope)
        runCurrent()

        assertTrue(repo.declineRequest("req-2") is AppResult.Success)
        // The backend guard only accepts "rejected"; the old "declined" value was a 400.
        coVerify(exactly = 1) { api.updateFriendRequestStatus("req-2", "rejected") }
    }

    @Test fun nonRpcFailureDoesNotFallBack() = runTest {
        val api = mockk<SupabaseRestApi>()
        val auth = mockk<AuthRepository>()
        val users = mockk<UserRepository>(relaxed = true)
        every { auth.sessionFlow } returns MutableStateFlow(session("me"))
        stubEmptyRefresh(api)
        coEvery { api.acceptFriendRequestRpc("req-1") } throws IllegalStateException("boom")

        val repo = buildRepo(api, auth, users, StandardTestDispatcher(testScheduler), backgroundScope)
        runCurrent()

        assertTrue(repo.acceptRequest("req-1", "them") is AppResult.Failure)
        coVerify(exactly = 0) { api.updateFriendRequestStatus(any(), any()) }
        coVerify(exactly = 0) { api.insertFriendship(any()) }
    }

    @Test fun statusMappingTreatsRejectedAsDeclined() {
        assertEquals(FriendRequestStatus.DECLINED, "rejected".toRequestStatus())
        assertEquals(FriendRequestStatus.DECLINED, "declined".toRequestStatus())
        assertEquals(FriendRequestStatus.CANCELLED, "cancelled".toRequestStatus())
        assertEquals(FriendRequestStatus.ACCEPTED, "accepted".toRequestStatus())
        assertEquals(FriendRequestStatus.PENDING, "pending".toRequestStatus())
        assertEquals(FriendRequestStatus.PENDING, null.toRequestStatus())
    }

    @Test fun rpcErrorsMapToUserFacingAppErrors() {
        assertTrue(FriendRequestRpcResult(error = "NOT_AUTHENTICATED").toAppError() is AppError.Unauthorized)
        assertTrue(FriendRequestRpcResult(error = "NOT_RECIPIENT").toAppError() is AppError.Forbidden)
        assertTrue(FriendRequestRpcResult(error = "BLOCKED").toAppError() is AppError.Forbidden)
        assertTrue(FriendRequestRpcResult(error = "REQUEST_NOT_FOUND").toAppError() is AppError.Validation)
        assertTrue(FriendRequestRpcResult(error = "REQUEST_NOT_PENDING").toAppError() is AppError.Validation)
    }
}
