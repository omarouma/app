package app.gagachat.core.ui.util

import app.gagachat.core.common.result.AppError
import app.gagachat.core.ui.state.ScreenState

/**
 * Converts a failed [AppError] into the most specific [ScreenState] (Master Spec
 * §E). When the failure is a connectivity failure ([AppError.Network]) *and* the
 * device is genuinely offline, we surface the dedicated [ScreenState.Offline]
 * state (which shows the "You're offline" copy and the reconnect hint) instead of
 * a generic error. Every other failure becomes a [ScreenState.Error] whose
 * [ScreenState.Error.retryable] flag reflects whether a retry could help.
 *
 * @param isOnline the current connectivity, from `NetworkMonitor`.
 */
fun AppError.toScreenStateError(isOnline: Boolean): ScreenState<Nothing> =
    if (this is AppError.Network && !isOnline) {
        ScreenState.Offline
    } else {
        ScreenState.Error(toUserMessage(), retryable = isRecoverable)
    }

/**
 * Like [toUserMessage] but returns `null` for a connectivity failure while the
 * device is offline. Screens that surface a transient error string (a snackbar /
 * inline message) use this so the app-wide offline banner is the single source
 * of truth and the user doesn't also see a redundant "no internet" toast.
 */
fun AppError.toUserMessageOrNull(isOnline: Boolean): String? =
    if (this is AppError.Network && !isOnline) null else toUserMessage()
