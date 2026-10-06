package app.gagachat.core.network.rest

import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.session.AuthSession
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class MutationContractTest {
    private val store = object : SessionStore {
        override fun save(session: AuthSession) = Unit
        override fun load(): AuthSession? = null
        override fun updateTokens(accessToken: String, refreshToken: String, expiresAtMillis: Long) = Unit
        override fun clear() = Unit
        override fun accessToken() = "test-session"
        override fun userId() = "owner"
    }

    @Test fun bulkReadIsRestrictedToOwnersUnreadRows() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Patch, request.method)
            assertEquals("eq.owner", request.url.parameters["user_id"])
            assertEquals("eq.false", request.url.parameters["read"])
            assertEquals("Bearer test-session", request.headers["Authorization"])
            respond("", HttpStatusCode.NoContent)
        }
        val client = HttpClient(engine) { install(ContentNegotiation) { json() } }
        try { SupabaseRestApi(client, SupabaseConfig("https://example.test", "key", "media"), store).markAllNotificationsRead("owner") }
        finally { client.close() }
    }

    @Test fun zeroRowsAreNotAcknowledgedAsSuccessfulDeletion() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Delete, request.method)
            assertEquals("eq.missing", request.url.parameters["id"])
            assertEquals("return=representation", request.headers["Prefer"])
            respond("[]", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val client = HttpClient(engine) { install(ContentNegotiation) { json() } }
        try {
            val api = SupabaseRestApi(client, SupabaseConfig("https://example.test", "key", "media"), store)
            assertTrue(runCatching { api.deleteSavedMessage("missing") }.exceptionOrNull() is IllegalStateException)
            assertTrue(runCatching { api.deleteConversation("missing") }.exceptionOrNull() is IllegalStateException)
        } finally { client.close() }
    }
}
