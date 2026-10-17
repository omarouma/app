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

class AttachmentSearchContractTest {
    private val sessions = object : SessionStore {
        override fun save(session: AuthSession) = Unit
        override fun load(): AuthSession? = null
        override fun updateTokens(accessToken: String, refreshToken: String, expiresAtMillis: Long) = Unit
        override fun clear() = Unit
        override fun accessToken() = "owner-token"
        override fun userId() = "owner"
    }

    @Test fun crossChatSearchRetainsAuthorizationFiltersAndStablePageOrdering() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals("Bearer owner-token", request.headers[HttpHeaders.Authorization])
            assertEquals("/rest/v1/messages", request.url.encodedPath)
            val p = request.url.parameters
            assertNull(p["chat_id"])
            assertEquals("in.(file,audio)", p["type"])
            assertEquals("(destroyed.is.null,destroyed.eq.false)", p["or"])
            assertEquals("not.is.null", p["media_url"])
            assertEquals("created_at.desc,id.desc", p["order"])
            assertEquals("40", p["offset"])
            assertEquals("40", p["limit"])
            assertEquals("ilike.*invoice*", p["content"])
            respond("[]", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        HttpClient(engine) { install(ContentNegotiation) { json() } }.use { client ->
            assertTrue(SupabaseRestApi(client, SupabaseConfig("https://example.test", "public-key", "media"), sessions)
                .searchAttachments("invoice", 40).isEmpty())
        }
    }

    @Test fun filterSyntaxAndWildcardsCannotExpandTheSearch() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals("ilike.*file  destroyed.eq.false*", request.url.parameters["content"])
            assertEquals("0", request.url.parameters["offset"])
            assertEquals("100", request.url.parameters["limit"])
            respond("[]", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        HttpClient(engine) { install(ContentNegotiation) { json() } }.use { client ->
            SupabaseRestApi(client, SupabaseConfig("https://example.test", "public-key", "media"), sessions)
                .searchAttachments("file*,destroyed.eq.false", -5, 1000)
        }
    }
}
