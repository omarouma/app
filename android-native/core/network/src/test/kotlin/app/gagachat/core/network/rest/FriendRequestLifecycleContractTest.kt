package app.gagachat.core.network.rest

import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.error.RpcAvailability
import app.gagachat.core.network.session.AuthSession
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Contract tests for the atomic friend-request lifecycle RPCs (FR-04/FR-05/FR-06).
 * They pin the endpoint, verb, auth header and JSON body the client sends, and
 * prove the "function not deployed" fallback signal is detected precisely (a 404
 * carrying PGRST202) without ever swallowing a genuine domain rejection (which is
 * a 200 carrying an `error` field).
 */
class FriendRequestLifecycleContractTest {

    private val store = object : SessionStore {
        override fun save(session: AuthSession) = Unit
        override fun load(): AuthSession? = null
        override fun updateTokens(accessToken: String, refreshToken: String, expiresAtMillis: Long) = Unit
        override fun clear() = Unit
        override fun accessToken() = "test-session"
        override fun userId() = "test-user"
    }

    private val config = SupabaseConfig("https://example.test", "public-key", "media")

    private fun client(engine: MockEngine) = HttpClient(engine) {
        expectSuccess = true
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
    }

    @Test fun acceptPostsToAtomicRpcAndParsesFriendId() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Post, request.method)
            assertTrue(
                "unexpected path ${request.url.encodedPath}",
                request.url.encodedPath.endsWith("/rpc/gaga_accept_friend_request"),
            )
            assertEquals("Bearer test-session", request.headers["Authorization"])
            val body = Json.parseToJsonElement(
                String((request.body as OutgoingContent.ByteArrayContent).bytes()),
            ).jsonObject
            assertEquals("req-1", body["p_request_id"]!!.jsonPrimitive.content)
            respond(
                """{"status":"accepted","request_id":"req-1","friend_id":"user-9"}""",
                HttpStatusCode.OK,
                headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }
        val client = client(engine)
        try {
            val result = SupabaseRestApi(client, config, store).acceptFriendRequestRpc("req-1")
            assertEquals("accepted", result.status)
            assertEquals("user-9", result.friendId)
            assertNull(result.error)
        } finally { client.close() }
    }

    @Test fun declineAndCancelTargetTheirOwnRpc() = runBlocking {
        val seen = mutableListOf<String>()
        val engine = MockEngine { request ->
            seen += request.url.encodedPath.substringAfterLast("/rpc/")
            respond(
                """{"status":"ok"}""",
                HttpStatusCode.OK,
                headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }
        val client = client(engine)
        try {
            val api = SupabaseRestApi(client, config, store)
            api.declineFriendRequestRpc("req-2")
            api.cancelFriendRequestRpc("req-3")
        } finally { client.close() }
        assertEquals(
            listOf("gaga_decline_friend_request", "gaga_cancel_friend_request"),
            seen,
        )
    }

    @Test fun domainRejectionIsParsedNotThrown() = runBlocking {
        val engine = MockEngine {
            respond(
                """{"error":"REQUEST_NOT_PENDING","status":"accepted"}""",
                HttpStatusCode.OK,
                headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }
        val client = client(engine)
        try {
            val result = SupabaseRestApi(client, config, store).acceptFriendRequestRpc("req-4")
            assertEquals("REQUEST_NOT_PENDING", result.error)
            assertFalse(RpcAvailability.isUnavailable(IllegalStateException("unrelated")))
        } finally { client.close() }
    }

    @Test fun missingFunctionIsDetectedAsUnavailable() = runBlocking {
        val engine = MockEngine {
            respond(
                """{"code":"PGRST202","message":"Could not find the function public.gaga_accept_friend_request(p_request_id) in the schema cache"}""",
                HttpStatusCode.NotFound,
                headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }
        val client = client(engine)
        try {
            val error = runCatching {
                SupabaseRestApi(client, config, store).acceptFriendRequestRpc("req-5")
            }.exceptionOrNull()
            assertTrue("expected a thrown transport error", error != null)
            assertTrue(RpcAvailability.isUnavailable(error!!))
        } finally { client.close() }
    }

    @Test fun serverFailureIsNotTreatedAsUnavailable() = runBlocking {
        val engine = MockEngine {
            respond(
                """{"message":"boom"}""",
                HttpStatusCode.InternalServerError,
                headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }
        val client = client(engine)
        try {
            val error = runCatching {
                SupabaseRestApi(client, config, store).acceptFriendRequestRpc("req-6")
            }.exceptionOrNull()
            assertTrue(error != null)
            assertFalse(RpcAvailability.isUnavailable(error!!))
        } finally { client.close() }
    }

    @Test fun nonResponseThrowableIsNotUnavailable() {
        assertFalse(RpcAvailability.isUnavailable(IllegalStateException("nope")))
    }
}
