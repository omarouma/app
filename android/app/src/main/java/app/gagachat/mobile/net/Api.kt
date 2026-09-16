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
        val base = baseUrl.toHttpUrlOrNull() ?: return false
        return url.scheme == base.scheme && url.host == base.host && url.port == base.port &&
            url.encodedPath.startsWith(base.encodedPath.trimEnd('/') + "/")
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
        val url = "${baseUrl.trimEnd('/')}/auth/refresh"
        val body = JSONObject().put("refresh_token", rt).toString()
            .toRequestBody("application/json".toMediaType())
        val req = Request.Builder().url(url)
            .post(body)
            .header("User-Agent", UA)
            .build()
        return try {
            refreshClient.newCall(req).execute().use { res ->
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
                        true
                    } else false
                } else false
            }
        } catch (e: Exception) {
            Log.w(TAG, "refresh failed: ${e.message}")
            false
        }
    }

    private suspend fun requestJson(method: String, path: String, body: JSONObject? = null): JSONObject = withContext(Dispatchers.IO) {
        val url = baseUrl.trimEnd('/') + path
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
        client.newCall(b.build()).execute().use { res ->
            val txt = res.body?.string() ?: ""
            if (!res.isSuccessful) {
                val serverError = runCatching { JSONObject(txt).optString("error") }
                    .getOrNull()?.takeIf { it.isNotBlank() }
                throw ApiError(res.code, serverError ?: "HTTP ${res.code}", txt)
            }
            if (txt.isBlank()) JSONObject()
            else runCatching { JSONObject(txt) }.getOrElse { JSONObject().put("raw", txt) }
        }
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
