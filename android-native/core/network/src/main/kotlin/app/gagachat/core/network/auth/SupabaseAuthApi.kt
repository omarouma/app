package app.gagachat.core.network.auth

import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.dto.AuthUser
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
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Supabase GoTrue auth endpoints (PDF \u00a73 \u2014 register/login/OTP/session bootstrap).
 *
 * ## Email links vs. codes
 *
 * On the free tier the built-in mailer cannot embed `{{ .Token }}` in the
 * magic-link / recovery templates, so every auth email contains a **link**
 * (`.../auth/v1/verify?token=<token_hash>&type=<type>&redirect_to=<url>`). The
 * client therefore accepts either a full emailed link *or* a typed one-time code
 * for every email proof, and it asks GoTrue to redirect the link back into the
 * app (see [sendOtp] / [requestRecovery] `redirectTo`) so a tap can complete the
 * flow without any copy-paste.
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

    /**
     * Sends a passwordless sign-in email. When [redirectTo] is supplied the
     * emailed link returns to the app (deep link) instead of the website, so a
     * tap on the link can sign the user straight in.
     */
    suspend fun sendOtp(
        email: String? = null,
        phone: String? = null,
        redirectTo: String? = null,
    ): Unit {
        client.post("${config.authUrl}/otp") {
            header("apikey", config.anonKey)
            contentType(ContentType.Application.Json)
            redirectTo?.let { parameter("redirect_to", it) }
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

    /** Requests a password-recovery email (optionally redirecting back into the app). */
    suspend fun requestRecovery(email: String, redirectTo: String? = null) {
        client.post("${config.authUrl}/recover") {
            header("apikey", config.anonKey)
            contentType(ContentType.Application.Json)
            redirectTo?.let { parameter("redirect_to", it) }
            setBody(buildJsonObject { put("email", email.trim()) })
        }
    }

    /**
     * Verifies an emailed recovery link/code and returns a short-lived session
     * that can be used to set a new password.
     */
    suspend fun verifyRecovery(email: String, proof: String): TokenResponse {
        val parsed = parseEmailLinkProof(proof)
        if (parsed.tokenHash != null) {
            require(parsed.host == java.net.URI(config.authUrl).host && parsed.type == "recovery") {
                "Use the recovery link sent by GaGa"
            }
        }
        return client.post("${config.authUrl}/verify") {
            header("apikey", config.anonKey)
            contentType(ContentType.Application.Json)
            setBody(
                buildJsonObject {
                    put("type", "recovery")
                    if (parsed.tokenHash != null) {
                        put("token_hash", parsed.tokenHash)
                    } else {
                        put("email", email.trim())
                        put("token", proof.trim())
                    }
                },
            )
        }.body()
    }

    /**
     * Verifies a passwordless sign-in proof. Accepts either the full magic link
     * Supabase emails (free-tier default mailer sends a link, not a code) or a
     * typed one-time code.
     */
    suspend fun verifyEmailOtp(email: String?, proof: String): TokenResponse {
        val parsed = parseEmailLinkProof(proof)
        val type = if (parsed.tokenHash != null) {
            require(parsed.host == java.net.URI(config.authUrl).host) {
                "Use the sign-in link sent by GaGa"
            }
            parsed.type ?: "magiclink"
        } else {
            "email"
        }
        return client.post("${config.authUrl}/verify") {
            header("apikey", config.anonKey)
            contentType(ContentType.Application.Json)
            setBody(
                buildJsonObject {
                    put("type", type)
                    if (parsed.tokenHash != null) {
                        put("token_hash", parsed.tokenHash)
                    } else {
                        email?.let { put("email", it.trim()) }
                        put("token", proof.trim())
                    }
                },
            )
        }.body()
    }

    suspend fun updatePassword(accessToken: String, password: String) {
        client.put("${config.authUrl}/user") {
            header("apikey", config.anonKey)
            header("Authorization", "Bearer $accessToken")
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("password", password) })
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

    /** Fetches the signed-in user for a freshly-minted token (deep-link sign-in). */
    suspend fun fetchUser(accessToken: String): AuthUser =
        client.get("${config.authUrl}/user") {
            header("apikey", config.anonKey)
            header("Authorization", "Bearer $accessToken")
        }.body()
}

/** Parsed pieces of an emailed auth link (or `null`s when [proof] is a bare code). */
data class EmailLinkProof(val tokenHash: String?, val type: String?, val host: String?)

/**
 * Extracts the `token_hash`/`token` and `type` from an emailed auth link. A bare
 * one-time code (no scheme/host) yields all-null, which callers treat as a typed
 * code rather than a link.
 */
fun parseEmailLinkProof(proof: String): EmailLinkProof {
    val link = runCatching { java.net.URI(proof.trim()) }.getOrNull()
        ?: return EmailLinkProof(null, null, null)
    val params = link.rawQuery
        ?.split("&")
        ?.mapNotNull { item ->
            item.split("=", limit = 2).takeIf { it.size == 2 }?.let {
                it[0] to runCatching { java.net.URLDecoder.decode(it[1], "UTF-8") }.getOrDefault(it[1])
            }
        }
        ?.toMap()
        .orEmpty()
    val hash = params["token_hash"] ?: params["token"]
    return EmailLinkProof(hash, params["type"], link.host)
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
