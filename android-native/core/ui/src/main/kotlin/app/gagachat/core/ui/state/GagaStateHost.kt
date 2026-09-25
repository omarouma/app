package app.gagachat.core.ui.state

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.LockClock
import androidx.compose.material.icons.filled.NoEncryption
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import app.gagachat.core.ui.component.GagaEmptyState
import app.gagachat.core.ui.component.GagaErrorState
import app.gagachat.core.ui.component.GagaLoading

/**
 * Renders a [ScreenState] into the correct visual for every case (Master Spec §E).
 *
 * Screens provide only the CONTENT renderer plus optional copy for the empty /
 * error / permission cases. All the plumbing — spinners, retry buttons, offline
 * and session-expiry affordances — lives here so behaviour is identical app-wide.
 */
@Composable
fun <T> GagaStateHost(
    state: ScreenState<T>,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
    onSessionExpired: (() -> Unit)? = null,
    emptyIcon: ImageVector = Icons.Filled.Inbox,
    emptyTitle: String = "Nothing here yet",
    emptyDescription: String? = null,
    emptyAction: (@Composable () -> Unit)? = null,
    permissionTitle: String = "Permission required",
    permissionDescription: String? = null,
    permissionAction: (@Composable () -> Unit)? = null,
    content: @Composable (T) -> Unit,
) {
    when (state) {
        ScreenState.Initial, ScreenState.Loading -> GagaLoading(modifier = modifier)

        is ScreenState.Content -> Box(modifier = modifier.fillMaxSize()) { content(state.data) }

        ScreenState.Empty -> GagaEmptyState(
            icon = emptyIcon,
            title = emptyTitle,
            modifier = modifier,
            description = emptyDescription,
            action = emptyAction,
        )

        ScreenState.Offline -> GagaErrorState(
            title = "You're offline",
            modifier = modifier,
            description = "Check your connection and try again. Cached content will appear once you reconnect.",
            onRetry = onRetry,
        )

        is ScreenState.Error -> GagaErrorState(
            title = "Something went wrong",
            modifier = modifier,
            description = state.message,
            onRetry = if (state.retryable) onRetry else null,
        )

        is ScreenState.PermissionDenied -> GagaEmptyState(
            icon = Icons.Filled.NoEncryption,
            title = permissionTitle,
            modifier = modifier,
            description = permissionDescription
                ?: "Enable this permission in system settings to continue.",
            action = permissionAction,
        )

        ScreenState.SessionExpired -> GagaEmptyState(
            icon = Icons.Filled.LockClock,
            title = "Session expired",
            modifier = modifier,
            description = "For your security you've been signed out. Please sign in again.",
            action = {
                if (onSessionExpired != null) {
                    app.gagachat.core.ui.component.GagaPrimaryButton(
                        text = "Sign in",
                        onClick = onSessionExpired,
                        modifier = Modifier,
                    )
                }
            },
        )
    }
}

/** Offline-state icon reused by callers that build custom offline UIs. */
val OfflineIcon: ImageVector get() = Icons.Filled.CloudOff
