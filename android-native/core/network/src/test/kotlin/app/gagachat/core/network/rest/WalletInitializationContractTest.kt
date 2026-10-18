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

    @Test fun integerCoinHistoryExcludesFractionalCurrencyRows() = runBlocking {
        val engine = MockEngine { request ->
            assertEquals("eq.coins", request.url.parameters["currency"])
            assertEquals("eq.owner", request.url.parameters["user_id"])
            assertEquals("Bearer test-session", request.headers["Authorization"])
            respond("[]", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val client = HttpClient(engine) { install(ContentNegotiation) { json() } }
        try {
            assertTrue(SupabaseRestApi(client, SupabaseConfig("https://example.test", "key", "media"), store).getWalletTransactions("owner").isEmpty())
        } finally { client.close() }
    }

    @Test fun externalAddressCreationIsOwnerAuthenticatedWithoutUserIdOverride() = runBlocking {
        val engine = MockEngine { request ->
            assertTrue(request.url.encodedPath.endsWith("/rpc/gaga_add_external_wallet"))
            assertEquals("Bearer test-session", request.headers["Authorization"])
            val body = String((request.body as OutgoingContent.ByteArrayContent).bytes())
            assertFalse(body.contains("user_id"))
            respond("""{"id":"one","user_id":"owner","network":"bsc","address":"0x1111111111111111111111111111111111111111","label":"My wallet"}""",
                HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val client = HttpClient(engine) { install(ContentNegotiation) { json() } }
        try {
            val api = SupabaseRestApi(client, SupabaseConfig("https://example.test", "key", "media"), store)
            assertEquals("owner", api.addExternalWallet("bsc", "0x1111111111111111111111111111111111111111", "My wallet", "owner").userId)
            val mismatch = runCatching { api.chainSnapshot("one", "another-owner") }
            assertTrue(mismatch.exceptionOrNull() is kotlinx.coroutines.CancellationException)
        } finally { client.close() }
    }
    @Test fun decimalEncodedCoinLedgerDecodesExactly() = runBlocking {
        val json = Json { ignoreUnknownKeys = true }
        val row = json.decodeFromString<app.gagachat.core.network.dto.WalletTransactionRow>(
            """{"id":"entry","user_id":"owner","type":"transfer_in","amount":1.00,"balance_after":9007199254740993.00}""")
        assertEquals(1L, row.amount)
        assertEquals(9007199254740993L, row.balanceAfter)
        for (amount in listOf("1.5", "9223372036854775808", "null")) {
            assertTrue(runCatching { json.decodeFromString<app.gagachat.core.network.dto.WalletTransactionRow>(
                """{"id":"entry","user_id":"owner","type":"transfer_in","amount":$amount}""") }.isFailure)
        }
    }

    @Test fun groupMembershipProjectionContainsRequiredFields() = runBlocking {
        val engine = MockEngine { request ->
            val body = when {
                request.url.encodedPath.endsWith("/group_members") -> {
                    assertEquals("id,group_id,user_id,role,joined_at", request.url.parameters["select"])
                    """[{"id":"membership","group_id":"group","user_id":"owner","role":"owner","joined_at":"2026-10-18T00:00:00Z"}]"""
                }
                else -> """[{"id":"group","name":"My group","created_by":"owner"}]"""
            }
            respond(body, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val client = HttpClient(engine) { install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) } }
        try {
            val groups = SupabaseRestApi(client, SupabaseConfig("https://example.test", "key", "media"), store).getGroupsForUser("owner")
            assertEquals("My group", groups.single().name)
        } finally { client.close() }
    }

}
