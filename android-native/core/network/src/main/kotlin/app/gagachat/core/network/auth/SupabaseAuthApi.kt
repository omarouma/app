package app.gagachat.core.network.auth

import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.dto.OtpRequest
import app.gagachat.core.network.dto.RefreshRequest
import app.gagachat.core.network.dto.SignInRequest
import app.gagachat.core.network.dto.SignUpRequest
import app.gagachat.core.network.dto.TokenResponse
import app.gagachat.core.network.dto.VerifyOtpRequest
import app.gagachat.core.network.session.AuthSession
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
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

    suspend fun refresh(refreshToken: String): TokenResponse =
        client.post("${config.authUrl}/token?grant_type=refresh_token") {
            header("apikey", config.anonKey)
            contentType(ContentType.Application.Json)
            setBody(RefreshRequest(refreshToken))
        }.body()

    suspend fun signOut(accessToken: String) {
        client.post("${config.authUrl}/logout") {
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
        expiresAtMillis = expiresAt ?: (now + expiresIn * 1000),
        email = user?.email,
        phone = user?.phone,
        displayName = user?.userMetadata?.get("display_name"),
    )
}
