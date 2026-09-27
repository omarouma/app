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

@Serializable
data class AuthErrorResponse(
    val error: String? = null,
    @SerialName("error_description") val errorDescription: String? = null,
    val message: String? = null,
    @SerialName("msg") val msg: String? = null,
    @SerialName("error_code") val errorCode: String? = null,
)
