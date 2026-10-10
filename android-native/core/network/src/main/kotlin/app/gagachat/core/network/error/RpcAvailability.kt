package app.gagachat.core.network.error

import io.ktor.client.plugins.ResponseException
import kotlinx.coroutines.CancellationException

/**
 * Detects the PostgREST "function not found" signature so callers can fall back
 * to a legacy code path when a newly-shipped RPC has not been deployed to the
 * backend yet.
 *
 * PostgREST answers a request to an unknown `/rpc/<name>` endpoint with HTTP 404
 * and a body containing `PGRST202` ("Could not find the function
 * public.<name>(...) in the schema cache"). Treating exactly that signature as
 * "RPC unavailable" lets the client keep working against both an upgraded and a
 * not-yet-migrated backend, while never masking a genuine domain rejection: the
 * lifecycle RPCs return HTTP 200 with an `error` field for those.
 *
 * Ktor's [ResponseException] embeds the (cached) response body in its message
 * (`Bad response: <response>. Text: "<body>"`), so the signature can be detected
 * without re-reading the response body.
 */
object RpcAvailability {

    private const val MISSING_FUNCTION = "PGRST202"
    private const val MISSING_FUNCTION_TEXT = "Could not find the function"

    /**
     * True when [throwable] is a transport failure caused by the target RPC not
     * existing on the server. Cancellation is never treated as unavailable.
     */
    fun isUnavailable(throwable: Throwable): Boolean {
        if (throwable is CancellationException) return false
        if (throwable !is ResponseException) return false
        if (throwable.response.status.value != 404) return false
        val text = throwable.message.orEmpty()
        return text.contains(MISSING_FUNCTION) ||
            text.contains(MISSING_FUNCTION_TEXT, ignoreCase = true)
    }
}
