package app.gagachat.core.common.result

/**
 * Canonical error taxonomy. Network/DB/domain errors are mapped into this type at
 * the data-source boundary so the UI never sees provider-specific exceptions
 * (PDF §7 — error mapping).
 */
sealed class AppError(
    val message: String?,
    val cause: Throwable? = null,
) {
    /** No connectivity or request timed out. */
    class Network(message: String? = null, cause: Throwable? = null) : AppError(message, cause)

    /** Server returned a non-2xx response. */
    class Server(val code: Int, message: String? = null, cause: Throwable? = null) : AppError(message, cause)

    /** Authentication missing/expired/revoked (PDF §3). */
    class Unauthorized(message: String? = null, cause: Throwable? = null) : AppError(message, cause)

    /** Caller is authenticated but not permitted (RLS / membership). */
    class Forbidden(message: String? = null, cause: Throwable? = null) : AppError(message, cause)

    /** Local persistence failure. */
    class Database(message: String? = null, cause: Throwable? = null) : AppError(message, cause)

    /** Payload failed validation. */
    class Validation(message: String? = null, cause: Throwable? = null) : AppError(message, cause)

    /** Anything not otherwise classified. */
    class Unknown(message: String? = null, cause: Throwable? = null) : AppError(message, cause)

    val isRecoverable: Boolean
        get() = this is Network || this is Server || this is Unknown
}
