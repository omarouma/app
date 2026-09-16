package app.gagachat.mobile.net

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import app.gagachat.mobile.BuildConfig
import app.gagachat.mobile.GaGaApp
import app.gagachat.mobile.prefs.SessionStore
import okhttp3.Interceptor
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * C-01: single configurable endpoint (BuildConfig.API_BASE + runtime override).
 * m-03: UA without app version.
 * 401 → refresh once → retry (JWT rotation).
 */
object Api {

    const val TAG = "GaGaApi"

    // m-03: no version in UA — don't fingerprint the client to servers.
    private const val UA = "GaGaChat/Android"

    var baseUrl: String = BuildConfig.API_BASE
        set(v) { field = v.trimEnd('/') }

    class ApiError(val status: Int, message: String, val body: String? = null) : IOException(message)

    /**
     * DNS-resilience: additional endpoints tried, in order, when the primary
     * host cannot be resolved (UnknownHostException) or refuses the connection.
     * This keeps the app usable even if the primary DNS record is missing or
     * stale, without requiring a rebuild.
     */
    private val fallbackBases: List<String> by lazy {
        BuildConfig.FALLBACK_API_BASES
            .split(',')
            .map { it.trim().trimEnd('/') }
            .filter { it.isNotBlank() }
    }

    /** Ordered, de-duplicated list of endpoints to attempt for a request. */
    private fun candidateBases(): List<String> =
        (listOf(baseUrl.trimEnd('/')) + fallbackBases).distinct().filter { it.isNotBlank() }

    /** True for transport-level failures where trying another endpoint helps. */
    private fun isEndpointFailure(e: IOException): Boolean =
        e is java.net.UnknownHostException ||
            e is java.net.ConnectException ||
            e is java.net.NoRouteToHostException ||
            e is java.net.SocketTimeoutException ||
            e.cause is java.net.UnknownHostException

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .addInterceptor(headerInterceptor)
            .addNetworkInterceptor { chain ->
                val request = chain.request()
                chain.proceed(if (isApiUrl(request.url)) request else request.newBuilder().removeHeader("Authorization").build())
            }
            .authenticator(tokenAuthenticator)
            .build()
    }

    // Refresh must not use the authenticated client: otherwise a 401 from the
    // refresh endpoint recursively invokes this authenticator.
    private val refreshClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false)
            .followRedirects(false)
            .build()
    }

    // Deliberately has no GaGa Authorization interceptor: signed OSS URLs are
    // separate origins and must never receive the app JWT.
    private val objectStorageClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(90, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    private val headerInterceptor = Interceptor { chain ->
        val b = chain.request().newBuilder()
            .header("User-Agent", UA)
            .header("Accept", "application/json")
        if (isApiUrl(chain.request().url) && !isPublicAuth(chain.request().url)) {
            SessionStore.token?.let { b.header("Authorization", "Bearer $it") }
        } else b.removeHeader("Authorization")
        chain.proceed(b.build())
    }

    private fun isApiUrl(url: HttpUrl): Boolean {
        // Accept any configured endpoint (primary or fallback) so the app JWT is
        // attached regardless of which one the request actually used.
        return candidateBases().any { base ->
            val u = base.toHttpUrlOrNull() ?: return@any false
            url.scheme == u.scheme && url.host == u.host && url.port == u.port &&
                url.encodedPath.startsWith(u.encodedPath.trimEnd('/') + "/")
        }
    }

    private fun isPublicAuth(url: HttpUrl): Boolean =
        url.encodedPath.substringAfterLast('/') in setOf("login", "register", "refresh", "verify") ||
            url.encodedPath.endsWith("/auth/otp/request")

    /** Coil and downloads share authenticated API access, with origin checks on redirects. */
    fun mediaClient(): OkHttpClient = client

    // 401 → POST /auth/refresh → retry once
    private val tokenAuthenticator = object : okhttp3.Authenticator {
        override fun authenticate(route: okhttp3.Route?, response: Response): Request? {
            if (responseCount(response) > 1) return null // already retried
            if (!isApiUrl(response.request.url) || isPublicAuth(response.request.url)) return null
            val failedToken = response.request.header("Authorization")?.removePrefix("Bearer ")
            val refreshed = runCatching { refreshTokensBlocking(failedToken) }.getOrNull() ?: false
            if (refreshed) {
                return response.request.newBuilder()
                    .header("Authorization", "Bearer ${SessionStore.token}")
                    .build()
            }
            return null
        }
        private fun responseCount(r: Response?): Int {
            var c = 0
            var x = r
            while (x != null) { c++; x = x.priorResponse }
            return c
        }
    }

    @Synchronized
    private fun refreshTokensBlocking(failedToken: String?): Boolean {
        // Other HTTP requests or the socket may already have rotated this pair.
        val current = SessionStore.token ?: return false
        if (failedToken != null && current != failedToken) return true
        val rt = SessionStore.refreshToken ?: return false
        val body = JSONObject().put("refresh_token", rt).toString()
            .toRequestBody("application/json".toMediaType())
        for (base in candidateBases()) {
            val url = "${base.trimEnd('/')}/auth/refresh"
            val req = Request.Builder().url(url)
                .post(body)
                .header("User-Agent", UA)
                .build()
            try {
                val ok = refreshClient.newCall(req).execute().use { res ->
                    if (res.isSuccessful) {
                        val j = JSONObject(res.body?.string() ?: "{}")
                        val t = j.optString("token")
                        if (t.isNotBlank()) {
                            synchronized(SessionStore) {
                            if (SessionStore.refreshToken != rt) return false // logged out/replaced while refreshing
                            SessionStore.save(
                                GaGaApp.ctx(), t,
                                j.optString("refresh_token").takeIf { it.isNotBlank() } ?: rt,
                                j.optJSONObject("user")?.toString() ?: SessionStore.me
                            )
                            }
                            if (base != baseUrl.trimEnd('/')) baseUrl = base
                            true
                        } else false
                    } else false
                }
                if (ok) return true
                // Reachable but rejected (e.g. 401) — no point trying other hosts.
                return false
            } catch (e: Exception) {
                if (isEndpointFailure(e as? IOException ?: IOException(e)) && base != candidateBases().last()) {
                    Log.w(TAG, "refresh endpoint $base unreachable; trying next")
                    continue
                }
                Log.w(TAG, "refresh failed: ${e.message}")
                return false
            }
        }
        return false
    }

    private suspend fun requestJson(method: String, path: String, body: JSONObject? = null): JSONObject = withContext(Dispatchers.IO) {
        val bases = candidateBases()
        var lastEndpointError: IOException? = null
        for ((index, base) in bases.withIndex()) {
            val url = base.trimEnd('/') + path
            val b: Request.Builder = Request.Builder().url(url)
            when (method) {
                "GET" -> b.get()
                "DELETE" -> if (body == null) b.delete() else b.delete(body.toString().toRequestBody("application/json".toMediaType()))
                "POST", "PUT" -> {
                    val media = "application/json; charset=utf-8".toMediaType()
                    val requestBody = (body?.toString() ?: "{}").toRequestBody(media)
                    if (method == "PUT") b.put(requestBody) else b.post(requestBody)
                }
                else -> throw IllegalArgumentException("Unsupported HTTP method: $method")
            }
            try {
                val result = client.newCall(b.build()).execute().use { res ->
                    val txt = res.body?.string() ?: ""
                    if (!res.isSuccessful) {
                        val serverError = runCatching { JSONObject(txt).optString("error") }
                            .getOrNull()?.takeIf { it.isNotBlank() }
                        throw ApiError(res.code, serverError ?: "HTTP ${res.code}", txt)
                    }
                    if (txt.isBlank()) JSONObject()
                    else runCatching { JSONObject(txt) }.getOrElse { JSONObject().put("raw", txt) }
                }
                // Success: remember the endpoint that worked so subsequent
                // requests (and the WebSocket) use it directly.
                if (base != baseUrl.trimEnd('/')) {
                    Log.i(TAG, "failover: switched endpoint to $base")
                    baseUrl = base
                }
                return@withContext result
            } catch (e: ApiError) {
                // Server answered (e.g. 4xx/5xx) — the endpoint is reachable, so
                // do not fail over; surface the real error.
                throw e
            } catch (e: IOException) {
                if (isEndpointFailure(e) && index < bases.size - 1) {
                    Log.w(TAG, "endpoint $base unreachable (${e.javaClass.simpleName}); trying next")
                    lastEndpointError = e
                    continue
                }
                throw e
            }
        }
        throw lastEndpointError ?: IOException("no_api_endpoint_available")
    }

    suspend fun get(path: String): JSONObject = requestJson("GET", path)
    suspend fun post(path: String, body: JSONObject? = null): JSONObject = requestJson("POST", path, body)
    suspend fun put(path: String, body: JSONObject? = null): JSONObject = requestJson("PUT", path, body)
    suspend fun delete(path: String, body: JSONObject? = null): JSONObject = requestJson("DELETE", path, body)

    suspend fun getArray(path: String): JSONArray {
        val res = requestJson("GET", path)
        return res.optJSONArray("data") ?: JSONArray()
    }

    /** Private OSS upload: obtain a short-lived ticket, PUT without app JWT,
     * then finalize through the authenticated Alibaba API. */
    suspend fun uploadFile(file: File, mime: String, kind: String, onProgress: (Int) -> Unit = {}): JSONObject = withContext(Dispatchers.IO) {
        val compressed = if (mime.startsWith("image/") && file.length() > 512 * 1024) {
            runCatching { ImageCompressor.compress(file, maxDim = 2048, quality = 82) }.getOrDefault(file)
        } else file

        val uploadMime = if (compressed != file) "image/jpeg" else mime

        val ticket = post("/media/upload-ticket", JSONObject()
            .put("mime", uploadMime)
            .put("size", compressed.length())
            .put("kind", kind))
        val uploadUrl = ticket.optString("upload_url")
        val mediaId = ticket.optString("id")
        if (uploadUrl.isBlank() || mediaId.isBlank()) throw IOException("invalid_upload_ticket")
        val req = Request.Builder().url(uploadUrl)
            .put(ProgressRequestBody(compressed, uploadMime, onProgress))
            .header("Content-Type", uploadMime)
            .build()
        objectStorageClient.newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw ApiError(res.code, "OSS upload failed (${res.code})", res.body?.string())
        }
        post("/media/$mediaId/complete")
    }

    /**
     * C-05-companion: WS URL derived from the same base (https→wss).
     */
    fun wsUrl(): String =
        baseUrl.trimEnd('/').replace("https://", "wss://").replace("http://", "ws://") + "/ws"

    /** File downloads to app-visible storage (avatar caching, image save). */
    suspend fun downloadToFile(url: String, dest: File): Boolean = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder().url(url).header("User-Agent", UA).build()
            client.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return@withContext false
                val body = res.body ?: return@withContext false
                dest.outputStream().use { out -> body.byteStream().use { it.copyTo(out) } }
                true
            }
        } catch (e: Exception) {
            Log.w(TAG, "download failed: $e")
            false
        }
    }

    suspend fun refreshTokens(failedAccessToken: String? = SessionStore.token): Boolean =
        withContext(Dispatchers.IO) { refreshTokensBlocking(failedAccessToken) }
}
