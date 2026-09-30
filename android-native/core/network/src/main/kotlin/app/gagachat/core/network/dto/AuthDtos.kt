package app.gagachat.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SignUpRequest(
    val email: String? = null,
    val phone: String? = null,
    val password: String,
    val data: Map<String, String>? = null,
)

@Serializable
data class SignInRequest(
    val email: String? = null,
    val phone: String? = null,
    val password: String,
)

@Serializable
data class RefreshRequest(
    @SerialName("refresh_token") val refreshToken: String,
)

@Serializable
data class OtpRequest(
    val email: String? = null,
    val phone: String? = null,
    @SerialName("create_user") val createUser: Boolean = true,
)

@Serializable
data class VerifyOtpRequest(
    val email: String? = null,
    val phone: String? = null,
    val token: String,
    val type: String = "email",
)

@Serializable
data class AuthUser(
    val id: String,
    val email: String? = null,
    val phone: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("email_confirmed_at") val emailConfirmedAt: String? = null,
    @SerialName("phone_confirmed_at") val phoneConfirmedAt: String? = null,
    @SerialName("user_metadata") val userMetadata: Map<String, String>? = null,
)

@Serializable
data class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("token_type") val tokenType: String = "bearer",
    @SerialName("expires_in") val expiresIn: Long = 3600,
    @SerialName("expires_at") val expiresAt: Long? = null,
    @SerialName("refresh_token") val refreshToken: String,
    val user: AuthUser? = null,
)

/**
 * Normalises the token expiry to absolute **milliseconds**.
 *
 * Supabase GoTrue returns `expires_at` as a Unix timestamp in **seconds**
 * (e.g. `1790752857`) while `expires_in` is a relative duration. The app stores
 * absolute milliseconds, so a raw seconds value must be widened by 1000.
 * Treating it as millis put the expiry in 1970, which made
 * [app.gagachat.core.network.session.AuthSession.needsRefresh] permanently true
 * and left the client unable to reason about token freshness at all.
 */
fun TokenResponse.expiryMillisOr(nowMillis: Long): Long {
    val raw = expiresAt
    return when {
        raw == null || raw <= 0L -> nowMillis + expiresIn * 1000L
        // Anything below ~year 5138 in millis must be a seconds value.
        raw < 100_000_000_000L -> raw * 1000L
        else -> raw
    }
}

@Serializable
data class AuthErrorResponse(
    val error: String? = null,
    @SerialName("error_description") val errorDescription: String? = null,
    val message: String? = null,
    @SerialName("msg") val msg: String? = null,
    @SerialName("error_code") val errorCode: String? = null,
)
