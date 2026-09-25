package app.gagachat.core.ui.util

import app.gagachat.core.common.result.AppError

/**
 * Maps the canonical [AppError] taxonomy to short, human-readable strings.
 * Keeps user-facing copy out of the data layer and consistent across screens.
 *
 * Auth-specific provider errors (Supabase GoTrue returns terse strings such as
 * "Invalid login credentials" or the machine code "phone_provider_disabled") are
 * normalised through [friendlyAuthMessage] so the sign-in / register screens can
 * always show a clear, actionable sentence instead of a raw backend token.
 */
fun AppError.toUserMessage(): String = when (this) {
    is AppError.Network -> "No internet connection. Please check your network and try again."
    is AppError.Server -> when (code) {
        400 -> friendlyAuthMessage(message) ?: "Something was wrong with the request. Please try again."
        401 -> friendlyAuthMessage(message) ?: "Your session has expired. Please sign in again."
        403 -> friendlyAuthMessage(message) ?: "You don't have permission to do that."
        404 -> "We couldn't find what you were looking for."
        409 -> friendlyConflictMessage(message) ?: "That action conflicts with existing data."
        422 -> friendlyAuthMessage(message) ?: "Please check the information you entered."
        429 -> "Too many attempts. Please wait a moment and try again."
        in 500..599 -> "The server is having trouble. Please try again shortly."
        else -> friendlyAuthMessage(message) ?: "Something went wrong. Please try again."
    }
    is AppError.Unauthorized -> friendlyAuthMessage(message) ?: "Your session has expired. Please sign in again."
    is AppError.Forbidden -> "You don't have permission to do that."
    is AppError.Database -> "We couldn't save your data locally. Please try again."
    is AppError.Validation -> friendlyAuthMessage(message) ?: "Please check the information you entered."
    is AppError.Unknown -> friendlyAuthMessage(message) ?: "Something went wrong. Please try again."
}

/**
 * Translates known Supabase GoTrue auth error strings / codes into friendly copy.
 * Returns null when the message is not recognised so callers can fall back to a
 * generic sentence.
 */
internal fun friendlyAuthMessage(raw: String?): String? {
    val message = raw?.trim().orEmpty()
    if (message.isEmpty()) return null
    val lower = message.lowercase()

    return when {
        // Phone provider disabled on the backend (the root cause of the login bug).
        lower.contains("phone_provider_disabled") ||
            lower.contains("phone provider") ||
            lower.contains("phone signups are disabled") ||
            lower.contains("phone sign-in") ||
            lower.contains("sms") && lower.contains("disabled") ->
            "Phone sign-in isn't available yet — please use your email address."

        // Wrong email/password.
        lower.contains("invalid login credentials") ||
            lower.contains("invalid_grant") && lower.contains("credentials") ||
            lower.contains("invalid password") ->
            "Incorrect email or password. Please try again."

        // Email not yet confirmed.
        lower.contains("email not confirmed") ||
            lower.contains("email_not_confirmed") ->
            "Please confirm your email address, then sign in."

        // Duplicate registration.
        lower.contains("user already registered") ||
            lower.contains("already registered") ||
            lower.contains("user_already_exists") ->
            "An account with this email already exists. Try signing in instead."

        // Signups globally disabled.
        lower.contains("signups not allowed") ||
            lower.contains("signup is disabled") ||
            lower.contains("signups_disabled") ->
            "Sign-ups are currently unavailable. Please try again later."

        // Bad email address.
        lower.contains("email address") && lower.contains("invalid") ||
            lower.contains("unable to validate email") ||
            lower.contains("email_address_invalid") ->
            "Enter a valid email address."

        // Weak password.
        lower.contains("password should be at least") ||
            lower.contains("password is too short") ->
            "Password must be at least 6 characters."

        // Rate limiting.
        lower.contains("rate limit") ||
            lower.contains("over_email_send_rate_limit") ||
            lower.contains("too many requests") ->
            "Too many attempts. Please wait a moment and try again."

        // Unknown account.
        lower.contains("user not found") ->
            "We couldn't find an account with that email."

        // Expired / invalid OTP.
        lower.contains("token has expired") ||
            lower.contains("expired") && lower.contains("token") ->
            "That code has expired. Please request a new one."

        lower.contains("invalid token") ||
            lower.contains("otp") && lower.contains("invalid") ->
            "That code isn't correct. Please check and try again."

        else -> null
    }
}

/**
 * Translates PostgREST conflict (HTTP 409) bodies into friendly copy. The most
 * common case in the app is the `users_username_key` unique constraint, which
 * fires when a user picks a handle that is already taken. Returns null when the
 * conflict is not recognised so callers can fall back to a generic sentence.
 */
internal fun friendlyConflictMessage(raw: String?): String? {
    val lower = raw?.trim()?.lowercase().orEmpty()
    if (lower.isEmpty()) return null
    return when {
        lower.contains("users_username_key") ||
            (lower.contains("username") && lower.contains("duplicate")) ->
            "That username is already taken. Please choose another."

        lower.contains("duplicate key") || lower.contains("unique constraint") ->
            "That value is already in use. Please try a different one."

        else -> null
    }
}
