package app.gagachat.core.network.error

import app.gagachat.core.common.result.AppError
import io.ktor.client.plugins.HttpRequestTimeoutException
import io.ktor.client.plugins.ResponseException
import io.ktor.client.plugins.ServerResponseException
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.IOException
import java.net.UnknownHostException

/**
 * Maps transport/provider exceptions into the canonical [AppError] taxonomy so the
 * UI never sees Ktor/OkHttp specifics (PDF §7 — error mapping).
 */
object ErrorMapper {

    private val json = Json { ignoreUnknownKeys = true }

    fun map(throwable: Throwable): AppError = when (throwable) {
        is UnknownHostException, is IOException, is HttpRequestTimeoutException,
        is TimeoutCancellationException,
        -> AppError.Network(throwable.message, throwable)

        is ClientRequestException -> {
            val code = throwable.response.status.value
            when (code) {
                401 -> AppError.Unauthorized(extractMessage(throwable), throwable)
                403 -> AppError.Forbidden(extractMessage(throwable), throwable)
                400, 422 -> AppError.Validation(extractMessage(throwable), throwable)
                else -> AppError.Server(code, extractMessage(throwable), throwable)
            }
        }

        is ServerResponseException -> AppError.Server(
            throwable.response.status.value,
            extractMessage(throwable),
            throwable,
        )

        is ResponseException -> AppError.Server(
            throwable.response.status.value,
            extractMessage(throwable),
            throwable,
        )

        else -> AppError.Unknown(throwable.message, throwable)
    }

    private fun extractMessage(exception: ResponseException): String? = runCatching {
        val body = exception.response.bodyAsText()
        val obj = json.parseToJsonElement(body).jsonObject
        obj["message"]?.jsonPrimitive?.content
            ?: obj["msg"]?.jsonPrimitive?.content
            ?: obj["error_description"]?.jsonPrimitive?.content
            ?: obj["error"]?.jsonPrimitive?.content
    }.getOrNull()
}
