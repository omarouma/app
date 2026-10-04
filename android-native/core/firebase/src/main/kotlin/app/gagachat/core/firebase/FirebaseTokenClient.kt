package app.gagachat.core.firebase

import app.gagachat.core.network.config.SupabaseConfig
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Calls the Supabase `firebase-token` edge function to mint a Firebase custom
 * token whose `uid` equals the caller's Supabase user id.
 *
 * The shared [HttpClient] already attaches the Supabase bearer token (via
 * `AuthTokenInterceptor`); the edge function is deployed with `--no-verify-jwt`
 * and authenticates the caller itself from that bearer token.
 */
@Singleton
class FirebaseTokenClient @Inject constructor(
    private val httpClient: HttpClient,
    private val config: SupabaseConfig,
    private val transportConfig: FirebaseTransportConfig,
) {
    @Serializable
    data class MintedToken(
        val customToken: String,
        val uid: String,
        val projectId: String? = null,
        val expiresIn: Long? = null,
    )

    /** Best-effort: returns a failed [Result] instead of throwing on any error. */
    suspend fun mint(): Result<MintedToken> = runCatching {
        httpClient.get("${config.functionsUrl}/${transportConfig.tokenFunction}") {
            header("apikey", config.anonKey)
        }.body<MintedToken>()
    }
}
