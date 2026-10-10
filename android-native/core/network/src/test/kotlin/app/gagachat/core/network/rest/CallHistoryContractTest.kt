package app.gagachat.core.network.rest

import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.session.AuthSession
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class CallHistoryContractTest {
    private val store = object : SessionStore {
        override fun save(session: AuthSession) = Unit
        override fun load(): AuthSession? = null
        override fun updateTokens(accessToken: String, refreshToken: String, expiresAtMillis: Long) = Unit
        override fun clear() = Unit
        override fun accessToken() = "test-session"
        override fun userId() = "test-user"
    }

    @Test fun rejectedCallUsesDatabaseStatusAndSeconds() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Patch, request.method)
            assertEquals("eq.call-id", request.url.parameters["id"])
            assertEquals("Bearer test-session", request.headers["Authorization"])
            val body = Json.parseToJsonElement(String((request.body as OutgoingContent.ByteArrayContent).bytes())).jsonObject
            assertEquals("declined", body["status"]!!.jsonPrimitive.content)
            assertEquals("7", body["duration"]!!.jsonPrimitive.content)
            respond("", HttpStatusCode.NoContent)
        }
        val client = HttpClient(engine) { install(ContentNegotiation) { json() } }
        try {
            SupabaseRestApi(client, SupabaseConfig("https://example.test", "public-key", "media"), store)
                .updateCallHistory("call-id", "rejected", 1_000L, 7_999L)
        } finally { client.close() }
    }

    @Test fun connectedUpdateIsConditionalAndDoesNotEndTheCall() = runBlocking {
        val engine = MockEngine { request ->
            // Must allow the callee-accepted and reconnecting states too, or the
            // transition to "connected" is silently dropped (CALL-08).
            assertEquals(
                "in.(calling,ringing,connecting,connected,accepted,reconnecting)",
                request.url.parameters["status"],
            )
            val body = Json.parseToJsonElement(String((request.body as OutgoingContent.ByteArrayContent).bytes())).jsonObject
            assertEquals("connected", body["status"]!!.jsonPrimitive.content)
            assertFalse(body.containsKey("ended_at"))
            respond("", HttpStatusCode.NoContent)
        }
        val client = HttpClient(engine) { install(ContentNegotiation) { json() } }
        try {
            SupabaseRestApi(client, SupabaseConfig("https://example.test", "public-key", "media"), store)
                .markCallConnected("call-id")
        } finally { client.close() }
    }
}
