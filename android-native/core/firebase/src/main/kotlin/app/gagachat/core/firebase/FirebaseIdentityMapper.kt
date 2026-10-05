package app.gagachat.core.firebase

import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.network.config.SupabaseConfig
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.ResponseException
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The single authority that ties a Firebase identity to a GaGa user id
 * (migration spec §2 — account protection).
 *
 * It talks to the trusted `firebase-identity` edge function, which:
 *   • mints a brand-new GaGa id for a verified, unmapped Firebase account
 *     (`action: "signup"`), or
 *   • links an **existing** GaGa account to a Firebase account when the caller
 *     proves control of *both* (a valid Firebase ID token **and** a valid legacy
 *     Supabase session, `action: "link"`).
 *
 * It NEVER links on an email string alone: linking requires the legacy session,
 * and a conflicting mapping is rejected (`IDENTITY_CONFLICT`) rather than merged.
 * This is the client half of that contract — it simply refuses to offer an
 * email-based link path.
 */
@Singleton
class FirebaseIdentityMapper @Inject constructor(
    private val httpClient: HttpClient,
    private val config: SupabaseConfig,
    private val transportConfig: FirebaseTransportConfig,
    private val idTokens: FirebaseIdTokenProvider,
) {
    /** The canonical identity resolved by the backend. */
    data class GagaIdentity(
        val gagaUserId: String,
        val username: String?,
        val displayName: String?,
        val method: String,
        val existing: Boolean,
    )

    @Serializable
    private data class IdentityRequest(
        val action: String,
        @SerialName("display_name") val displayName: String? = null,
        val username: String? = null,
    )

    @Serializable
    private data class IdentityResponse(
        @SerialName("gaga_user_id") val gagaUserId: String? = null,
        val username: String? = null,
        @SerialName("display_name") val displayName: String? = null,
        val method: String? = null,
        val existing: Boolean = false,
        val error: String? = null,
        val message: String? = null,
    )

    /** The canonical GaGa id already present in the current ID token, if mapped. */
    suspend fun mappedId(): String? = idTokens.current()?.gagaUserId

    /**
     * Registers a brand-new GaGa account for the verified Firebase user. Requires
     * a verified email (the backend returns `EMAIL_NOT_VERIFIED` otherwise).
     */
    suspend fun register(displayName: String?, username: String?): AppResult<GagaIdentity> =
        call(IdentityRequest(action = "signup", displayName = displayName, username = username), legacyToken = null)

    /**
     * Links the currently signed-in Firebase user to an existing GaGa account,
     * proving control via the legacy Supabase access token.
     */
    suspend fun link(legacyAccessToken: String): AppResult<GagaIdentity> =
        call(IdentityRequest(action = "link"), legacyToken = legacyAccessToken)

    private suspend fun call(request: IdentityRequest, legacyToken: String?): AppResult<GagaIdentity> {
        val token = idTokens.fresh()?.value
            ?: return AppResult.Failure(AppError.Unauthorized("Sign in again."))
        return try {
            val response: IdentityResponse = httpClient.post(
                "${config.functionsUrl}/${transportConfig.identityFunction}",
            ) {
                header("apikey", config.anonKey)
                header("Authorization", "Bearer $token")
                if (legacyToken != null) header("X-Legacy-Authorization", "Bearer $legacyToken")
                contentType(ContentType.Application.Json)
                setBody(request)
            }.body()

            val id = response.gagaUserId
            if (id.isNullOrBlank()) {
                AppResult.Failure(AppError.Unknown(response.message ?: "Identity mapping failed."))
            } else {
                AppResult.Success(
                    GagaIdentity(
                        gagaUserId = id,
                        username = response.username,
                        displayName = response.displayName,
                        method = response.method ?: "signup",
                        existing = response.existing,
                    ),
                )
            }
        } catch (e: ResponseException) {
            AppResult.Failure(mapError(e.status.value, runCatching { e.response.bodyAsText() }.getOrNull(), e))
        } catch (t: Throwable) {
            if (t is kotlinx.coroutines.CancellationException) throw t
            AppResult.Failure(AppError.Network("Could not reach the identity service.", t))
        }
    }

    private fun mapError(status: Int, body: String?, cause: Throwable): AppError {
        val code = body?.let { extractErrorCode(it) }
        return when {
            status == 401 -> AppError.Unauthorized("Sign in again to continue.")
            status == 403 && code == "EMAIL_NOT_VERIFIED" ->
                AppError.Forbidden("Verify your email address first.")
            status == 403 -> AppError.Forbidden("This account is not permitted to sign in.")
            status == 409 && code == "IDENTITY_CONFLICT" ->
                AppError.Validation("This account is already linked to a different sign-in method.")
            status == 409 -> AppError.Validation("This account is already linked.")
            status == 503 -> AppError.Server(status, "Identity service is temporarily unavailable.", cause)
            else -> AppError.Server(status, "Identity mapping failed ($status).", cause)
        }
    }

    private fun extractErrorCode(body: String): String? =
        Regex("\"error\"\\s*:\\s*\"([^\"]+)\"").find(body)?.groupValues?.getOrNull(1)
}
