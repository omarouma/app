package app.gagachat.core.network.rest

import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.session.AuthSession
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.*
import io.ktor.http.content.OutgoingContent
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class WalletInitializationContractTest {
    private val store = object : SessionStore {
        override fun save(session: AuthSession) = Unit
        override fun load(): AuthSession? = null
        override fun updateTokens(accessToken: String, refreshToken: String, expiresAtMillis: Long) = Unit
        override fun clear() = Unit
        override fun accessToken() = "test-session"
        override fun userId() = "owner"
    }

    @Test fun initializationUsesAuthenticatedRpcWithoutClientBalanceOrOwner() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Post, request.method)
            assertTrue(request.url.encodedPath.endsWith("/rpc/ensure_wallet"))
            assertEquals("Bearer test-session", request.headers["Authorization"])
            assertTrue(request.url.parameters.isEmpty())
            val body = String((request.body as OutgoingContent.ByteArrayContent).bytes())
            assertEquals("{}", body)
            respond("""{"id":"wallet","user_id":"owner","coins":45}""",
                HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val client = HttpClient(engine) { install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) } }
        try {
            val wallet = SupabaseRestApi(client, SupabaseConfig("https://example.test", "key", "media"), store).ensureWallet()
            assertEquals("owner", wallet.userId)
            assertEquals(45L, wallet.coins)
        } finally { client.close() }
    }
}
