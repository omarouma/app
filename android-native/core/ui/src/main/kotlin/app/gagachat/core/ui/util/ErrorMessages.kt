package app.gagachat.core.ui.util

import app.gagachat.core.common.result.AppError

/**
 * Maps the canonical [AppError] taxonomy to short, human-readable strings.
 * Keeps user-facing copy out of the data layer and consistent across screens.
 */
fun AppError.toUserMessage(): String = when (this) {
    is AppError.Network -> "No internet connection. Please check your network and try again."
    is AppError.Server -> when (code) {
        400 -> "Something was wrong with the request. Please try again."
        401 -> "Your session has expired. Please sign in again."
        403 -> "You don't have permission to do that."
        404 -> "We couldn't find what you were looking for."
        409 -> "That action conflicts with existing data."
        422 -> "Please check the information you entered."
        429 -> "Too many attempts. Please wait a moment and try again."
        in 500..599 -> "The server is having trouble. Please try again shortly."
        else -> "Something went wrong. Please try again."
    }
    is AppError.Unauthorized -> "Your session has expired. Please sign in again."
    is AppError.Forbidden -> "You don't have permission to do that."
    is AppError.Database -> "We couldn't save your data locally. Please try again."
    is AppError.Validation -> message ?: "Please check the information you entered."
    is AppError.Unknown -> message ?: "Something went wrong. Please try again."
}
