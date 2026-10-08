package app.gagachat.core.network.rest

import app.gagachat.core.model.TranslateResult
import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/**
 * GaGa Language Bridge (Signature Features 2.4) client.
 *
 * The message text is sent to the authenticated `translate-message` Edge
 * Function, which holds the translation provider credentials server-side. The
 * provider key never ships inside the APK, and the function refuses to run for
 * unauthenticated callers.
 */
@Singleton
class TranslateApi @Inject constructor(
    private val client: HttpClient,
    private val config: SupabaseConfig,
    private val session: SessionStore,
) {
    private fun HttpRequestBuilder.auth() {
        val token = requireNotNull(session.accessToken()) { "Please sign in again" }
        header("apikey", config.anonKey)
        header("Authorization", "Bearer $token")
        contentType(ContentType.Application.Json)
    }

    /**
     * Translates [text] into [target] (an ISO-639-1 code). [source] may be
     * "auto" to let the provider detect the language.
     */
    suspend fun translate(text: String, target: String, source: String = "auto"): TranslateResult {
        val response: TranslateResponse = client.post("${config.functionsUrl}/translate-message") {
            auth()
            setBody(
                buildJsonObject {
                    put("text", text)
                    put("target", target)
                    put("source", source)
                },
            )
        }.body()
        return TranslateResult(
            translated = response.translated,
            sourceLang = response.sourceLang,
            targetLang = response.targetLang.ifBlank { target },
            provider = response.provider,
        )
    }
}

@Serializable
private data class TranslateResponse(
    @SerialName("translated") val translated: String,
    @SerialName("source_lang") val sourceLang: String? = null,
    @SerialName("target_lang") val targetLang: String = "",
    @SerialName("provider") val provider: String = "gaga-translate",
)
