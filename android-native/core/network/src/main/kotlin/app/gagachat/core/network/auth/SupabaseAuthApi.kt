package app.gagachat.core.network.auth

import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.dto.OtpRequest
import app.gagachat.core.network.dto.RefreshRequest
import app.gagachat.core.network.dto.SignInRequest
import app.gagachat.core.network.dto.SignUpRequest
import app.gagachat.core.network.dto.TokenResponse
import app.gagachat.core.network.dto.VerifyOtpRequest
import app.gagachat.core.network.dto.expiryMillisOr
import app.gagachat.core.network.session.AuthSession
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.header
import io.ktor.client.request.put
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Supabase GoTrue auth endpoints (PDF §3 — register/login/OTP/session bootstrap).
 */
@Singleton
class SupabaseAuthApi @Inject constructor(
    private val client: HttpClient,
    private val config: SupabaseConfig,
) {

    suspend fun signUpWithPassword(
        email: String?,
        phone: String?,
        password: String,
        displayName: String?,
    ): TokenResponse = client.post("${config.authUrl}/signup") {
        header("apikey", config.anonKey)
        contentType(ContentType.Application.Json)
        setBody(
            SignUpRequest(
                email = email,
                phone = phone,
                password = password,
                data = displayName?.let { mapOf("display_name" to it) },
            ),
        )
    }.body()

    suspend fun signInWithPassword(
        email: String?,
        phone: String?,
        password: String,
    ): TokenResponse = client.post("${config.authUrl}/token?grant_type=password") {
        header("apikey", config.anonKey)
        contentType(ContentType.Application.Json)
        setBody(SignInRequest(email = email, phone = phone, password = password))
    }.body()

    suspend fun sendOtp(email: String? = null, phone: String? = null): Unit {
        client.post("${config.authUrl}/otp") {
            header("apikey", config.anonKey)
            contentType(ContentType.Application.Json)
            setBody(OtpRequest(email = email, phone = phone))
        }
    }

    suspend fun verifyOtp(
        email: String? = null,
        phone: String? = null,
        token: String,
        type: String = if (email != null) "email" else "sms",
    ): TokenResponse = client.post("${config.authUrl}/verify") {
        header("apikey", config.anonKey)
        contentType(ContentType.Application.Json)
        setBody(VerifyOtpRequest(email = email, phone = phone, token = token, type = type))
    }.body()

    suspend fun requestRecovery(email: String) {
        client.post("${config.authUrl}/recover") {
            header("apikey", config.anonKey); contentType(ContentType.Application.Json)
            setBody(kotlinx.serialization.json.buildJsonObject { put("email", email.trim()) })
        }
    }
    suspend fun verifyRecovery(email: String, proof: String): TokenResponse {
        val link = runCatching { java.net.URI(proof.trim()) }.getOrNull()
        val params = link?.rawQuery?.split("&")?.mapNotNull { item -> item.split("=", limit = 2).takeIf { it.size == 2 }?.let { it[0] to java.net.URLDecoder.decode(it[1], "UTF-8") } }?.toMap()
        val hash = params?.get("token_hash") ?: params?.get("token")
        require(hash == null || (link?.host == java.net.URI(config.authUrl).host && params?.get("type") == "recovery")) { "Use the recovery link sent by GaGa" }
        return client.post("${config.authUrl}/verify") {
            header("apikey", config.anonKey); contentType(ContentType.Application.Json)
            setBody(kotlinx.serialization.json.buildJsonObject {
                put("type", "recovery")
                if (hash != null) put("token_hash", hash)
                else { put("email", email.trim()); put("token", proof.trim()) }
            })
        }.body()
    }
    suspend fun updatePassword(accessToken: String, password: String) {
        client.put("${config.authUrl}/user") {
            header("apikey", config.anonKey); header("Authorization", "Bearer $accessToken")
            contentType(ContentType.Application.Json)
            setBody(kotlinx.serialization.json.buildJsonObject { put("password", password) })
        }
    }

    suspend fun refresh(refreshToken: String): TokenResponse =
        client.post("${config.authUrl}/token?grant_type=refresh_token") {
            header("apikey", config.anonKey)
            contentType(ContentType.Application.Json)
            setBody(RefreshRequest(refreshToken))
        }.body()

    suspend fun signOut(accessToken: String, scope: String = "local") {
        client.post("${config.authUrl}/logout?scope=$scope") {
            header("apikey", config.anonKey)
            header("Authorization", "Bearer $accessToken")
        }
    }
}

fun TokenResponse.toSession(): AuthSession {
    val now = System.currentTimeMillis()
    return AuthSession(
        userId = user?.id ?: "",
        accessToken = accessToken,
        refreshToken = refreshToken,
        expiresAtMillis = expiryMillisOr(now),
        email = user?.email,
        phone = user?.phone,
        displayName = user?.userMetadata?.get("display_name"),
    )
}
