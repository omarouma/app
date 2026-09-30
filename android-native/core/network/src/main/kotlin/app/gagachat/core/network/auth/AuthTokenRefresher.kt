package app.gagachat.core.network.auth

import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.dto.TokenResponse
import app.gagachat.core.network.dto.expiryMillisOr
import app.gagachat.core.network.session.SessionStore
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Single-flight Supabase token refresh.
 *
 * Supabase access tokens live for one hour. Before this class existed the app
 * captured the token once at sign-in and then used it for the whole session:
 * `validateAndRefresh()` only ever ran from `AppViewModel.init` /
 * `SplashViewModel.init`, so once the token expired every REST call, media
 * upload, `create-call` and `zego-token` request failed with 401 at the same
 * time — an empty chat list, messages stuck on PENDING, photos/videos that never
 * upload and calls that never ring.
 *
 * The refresh is performed with its own [OkHttpClient] so it can never queue
 * behind (or deadlock with) the very requests that are waiting for it on the
 * shared Ktor client.
 */
@Singleton
class AuthTokenRefresher @Inject constructor(
    private val sessionStore: SessionStore,
    private val config: SupabaseConfig,
    private val timeProvider: TimeProvider,
    private val logger: AppLogger,
) {

    private val mutex = Mutex()
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val refreshClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .build()
    }

    /**
     * Returns a usable access token, refreshing it first when it is missing or
     * within a minute of expiry. Concurrent callers share one refresh.
     *
     * @param force refresh even when the cached token still looks valid (used
     *   after the server rejected a token with 401).
     */
    suspend fun ensureFresh(force: Boolean = false): String? {
        val session = sessionStore.load() ?: return null
        if (!force && !session.needsRefresh(timeProvider.nowMillis())) return session.accessToken
        return mutex.withLock {
            // Re-read inside the lock: another caller may have refreshed already.
            val current = sessionStore.load() ?: return@withLock null
            if (!force && !current.needsRefresh(timeProvider.nowMillis())) {
                return@withLock current.accessToken
            }
            refresh(current.refreshToken)
        }
    }

    private fun refresh(refreshToken: String): String? = runCatching {
        val payload = """{"refresh_token":${json.encodeToString(refreshToken)}}"""
            .toRequestBody(JSON_MEDIA)
        val request = Request.Builder()
            .url("${config.authUrl}/token?grant_type=refresh_token")
            .header("apikey", config.anonKey)
            .post(payload)
            .build()
        refreshClient.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                logger.w(TAG, "Token refresh rejected (HTTP ${response.code})")
                return@runCatching null
            }
            val tokens = json.decodeFromString(TokenResponse.serializer(), text)
            sessionStore.updateTokens(
                accessToken = tokens.accessToken,
                refreshToken = tokens.refreshToken,
                expiresAtMillis = tokens.expiryMillisOr(timeProvider.nowMillis()),
            )
            tokens.accessToken
        }
    }.getOrElse {
        logger.w(TAG, "Token refresh failed", it)
        null
    }

    private companion object {
        const val TAG = "AuthTokenRefresher"
        val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }
}

/**
 * Attaches a fresh Supabase access token to every backend request and retries
 * once after a 401. Auth endpoints are skipped so the refresh call itself can
 * never recurse, and non-Supabase traffic (e.g. image CDNs) is untouched.
 *
 * This is what makes the app self-healing: a cold start that begins with an
 * expired token now performs its first conversation sync successfully instead of
 * showing an empty chat list until the user restarts.
 */
class AuthTokenInterceptor(
    private val refresher: AuthTokenRefresher,
    private val config: SupabaseConfig,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val url = request.url.toString()
        if (config.url.isBlank() || !url.startsWith(config.url) || url.contains("/auth/v1/")) {
            return chain.proceed(request)
        }

        val token = runCatching { runBlocking { refresher.ensureFresh() } }.getOrNull()
        val authorised = if (token.isNullOrBlank()) {
            request
        } else {
            request.newBuilder().header("Authorization", "Bearer $token").build()
        }

        val response = chain.proceed(authorised)
        if (response.code != 401) return response

        // The token was rejected server-side (revoked / clock skew). Force one
        // refresh and replay the request a single time.
        val fresh = runCatching { runBlocking { refresher.ensureFresh(force = true) } }.getOrNull()
        if (fresh.isNullOrBlank()) return response
        response.close()
        return chain.proceed(
            request.newBuilder().header("Authorization", "Bearer $fresh").build(),
        )
    }
}
