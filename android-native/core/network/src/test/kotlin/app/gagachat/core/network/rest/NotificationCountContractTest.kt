package app.gagachat.core.network.rest

import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.session.SessionStore
import app.gagachat.core.network.session.AuthSession
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class NotificationCountContractTest {
    @Test fun countIsAuthenticatedOwnerFilteredAndNotPageLimited() = runBlocking {
        val store = object : SessionStore {
            override fun save(session: AuthSession) = Unit
            override fun load(): AuthSession? = null
            override fun updateTokens(accessToken: String, refreshToken: String, expiresAtMillis: Long) = Unit
            override fun clear() = Unit
            override fun accessToken(): String = "test-token"
            override fun userId(): String = "a"
        }
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Head, request.method)
            assertEquals("eq.a", request.url.parameters["user_id"])
            assertEquals("(read.eq.false,read.is.null)", request.url.parameters["or"])
            assertEquals("count=exact", request.headers["Prefer"])
            assertEquals("Bearer test-token", request.headers["Authorization"])
            respond("", HttpStatusCode.PartialContent, headersOf("Content-Range", "0-0/83"))
        }
        val client = HttpClient(engine)
        try {
            assertEquals(83, SupabaseRestApi(client, SupabaseConfig("https://example.test", "public-key", "media"), store).getUnreadNotificationCount("a"))
        } finally { client.close() }
    }
}
