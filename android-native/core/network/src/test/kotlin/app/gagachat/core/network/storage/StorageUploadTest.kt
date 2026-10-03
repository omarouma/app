package app.gagachat.core.network.storage

import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.json
import io.ktor.client.engine.mock.toByteArray
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class StorageUploadTest {
    @Test fun rawFileReachesTransportWithExactBytesAndLength() = runBlocking {
        val expected = ByteArray(1024 * 1024 + 37) { (it % 251).toByte() }
        val file = File.createTempFile("gaga-upload", ".mp4").apply { writeBytes(expected) }
        var requests = 0
        val engine = MockEngine { request ->
            requests++
            assertEquals("/storage/v1/object/chat-media/me/upload.mp4", request.url.encodedPath)
            assertEquals("Bearer access", request.headers[HttpHeaders.Authorization])
            assertEquals("true", request.headers["x-upsert"])
            assertEquals(expected.size.toLong(), request.body.contentLength)
            assertEquals(ContentType.Video.MP4, request.body.contentType)
            assertArrayEquals(expected, request.body.toByteArray())
            respond("{}", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType,"application/json"))
        }
        val client = HttpClient(engine) { install(HttpTimeout); install(ContentNegotiation) { json() }; expectSuccess = true }
        val session = mockk<SessionStore> { every { accessToken() } returns "access" }
        try {
            val api = SupabaseStorageApi(client, SupabaseConfig("https://example.supabase.co","public","chat-media"),session)
            repeat(2) { api.uploadFile("me/upload.mp4",file,"video/mp4") }
            assertEquals(2, requests)
        } finally { client.close(); file.delete() }
    }
}
