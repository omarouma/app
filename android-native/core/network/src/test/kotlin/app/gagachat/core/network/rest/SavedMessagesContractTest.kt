package app.gagachat.core.network.rest

import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.dto.SavedMessageInsert
import app.gagachat.core.network.session.AuthSession
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class SavedMessagesContractTest {
    @Test fun savedMessageParsesPostgrestRepresentationArray() = runBlocking {
        val session = object : SessionStore {
            override fun save(session: AuthSession) = Unit
            override fun load(): AuthSession? = null
            override fun updateTokens(accessToken: String, refreshToken: String, expiresAtMillis: Long) = Unit
            override fun clear() = Unit
            override fun accessToken() = "session-token"
            override fun userId() = "owner"
        }
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("Bearer session-token", request.headers["Authorization"])
            assertEquals("return=representation", request.headers["Prefer"])
            respond("""[{"id":"saved","user_id":"owner","message_id":"message","chat_id":"chat","content":"remember this"}]""",
                HttpStatusCode.Created, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val client = HttpClient(engine) { install(ContentNegotiation) { json() } }
        try {
            val row = SupabaseRestApi(client, SupabaseConfig("https://example.test", "public-key", "media"), session)
                .saveMessage(SavedMessageInsert("owner", "message", "chat", content = "remember this"))
            assertEquals("saved", row.id)
            assertEquals("remember this", row.content)
        } finally { client.close() }
    }
}
