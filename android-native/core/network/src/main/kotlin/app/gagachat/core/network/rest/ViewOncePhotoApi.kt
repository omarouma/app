package app.gagachat.core.network.rest

import app.gagachat.core.network.auth.AuthTokenRefresher
import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.session.SessionStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.CancellationException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/** No disk cache, redirects, automatic account rebinding or automatic consume retries. */
@Singleton
class ViewOncePhotoApi @Inject constructor(
    private val config: SupabaseConfig,
    private val sessions: SessionStore,
    private val tokens: AuthTokenRefresher,
) {
    private val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .retryOnConnectionFailure(false).callTimeout(50, TimeUnit.SECONDS).build()

    suspend fun send(owner: String, chat: String, id: String, mime: String, bytes: ByteArray) {
        require(bytes.size in 12..MAX_BYTES && mime in setOf("image/jpeg", "image/png", "image/webp"))
        request(owner, id, "send", chat, bytes, mime).fill(0)
    }

    suspend fun open(owner: String, id: String): ByteArray = request(owner, id, "open")

    private suspend fun request(owner: String, id: String, action: String, chat: String? = null,
        bytes: ByteArray = byteArrayOf(), mime: String = "application/octet-stream"): ByteArray {
        if (sessions.userId() != owner) throw CancellationException("Account changed")
        val token = tokens.ensureFresh() ?: error("Sign in again")
        if (sessions.userId() != owner) throw CancellationException("Account changed")
        return withContext(Dispatchers.IO) {
            val builder = Request.Builder().url("${config.functionsUrl}/view-once-photo?action=$action")
                .header("Authorization", "Bearer $token").header("apikey", config.anonKey)
                .header("X-Photo-Id", id).header("Cache-Control", "no-store")
                .post(bytes.toRequestBody(mime.toMediaType()))
            chat?.let { builder.header("X-Chat-Id", it) }
            val result = client.newCall(builder.build()).execute().use { response ->
                check(response.isSuccessful) { "Photo already opened, expired or unavailable" }
                if (action == "open") check(response.header("Content-Type").orEmpty().startsWith("image/"))
                response.body?.byteStream()?.use { readPhotoBytes(it) } ?: error("Photo unavailable")
            }
            if (sessions.userId() != owner) { result.fill(0); throw CancellationException("Account changed") }
            result
        }
    }

    companion object {
        const val MAX_BYTES = 10 * 1024 * 1024
        fun readPhotoBytes(input: InputStream): ByteArray {
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (true) {
                val n = input.read(buffer)
                if (n < 0) break
                require(output.size() + n <= MAX_BYTES) { "Photo exceeds 10 MB" }
                output.write(buffer, 0, n)
            }
            return output.toByteArray()
        }
    }
}
