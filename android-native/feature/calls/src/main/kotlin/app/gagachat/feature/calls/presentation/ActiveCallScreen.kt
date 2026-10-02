package app.gagachat.feature.calls.presentation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaEmptyState
import app.gagachat.core.ui.component.GagaErrorState
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.theme.GagaDimens

/**
 * Call launcher surface. The ZEGOCLOUD Call Kit renders the real, full-screen
 * call UI (outgoing ring, incoming ring, in-call controls, video surfaces), so
 * this route only resolves the peer, records the call and hands off to the SDK.
 *
 * As soon as the Call Kit UI has been launched this launcher steps off the back
 * stack, so when the call finishes the user lands straight back on the chat.
 * Failures surface an error state with a clear way back.
 */
@Composable
fun ActiveCallRoute(
    onCallFinished: () -> Unit,
    conversationId: String? = null,
    isVideo: Boolean = false,
    viewModel: CallViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    // Bumping this re-runs the launcher so "Retry" genuinely re-attempts the call
    // (e.g. after the contact registers with calling, or the network recovers).
    var attempt by remember { mutableIntStateOf(0) }

    // Resolve the peer and start the real call once the route is composed.
    LaunchedEffect(conversationId, attempt) {
        if (conversationId != null) {
            viewModel.startCallForConversation(conversationId, isVideo)
        }
    }

    // The Call Kit owns the call UI; once it is up we pop this launcher.
    LaunchedEffect(state.phase, state.error) {
        if (state.phase == CallPhase.ENDED && state.error == null) onCallFinished()
    }

    androidx.activity.compose.BackHandler(enabled = state.phase != CallPhase.IDLE && state.phase != CallPhase.ENDED) {
        viewModel.endCall()
    }

    val error = state.error
    when {
        error != null -> GagaErrorState(
            title = "Call unavailable",
            description = error,
            onRetry = {
                viewModel.dismissEnded()
                onCallFinished()
            },
        )

        conversationId == null -> GagaEmptyState(
            icon = Icons.Filled.Call,
            title = "No active call",
            description = "Start a call from a chat, a profile or the call history.",
            action = {
                GagaPrimaryButton(
                    text = "Close",
                    onClick = onCallFinished,
                    modifier = Modifier.padding(horizontal = GagaDimens.space32),
                )
            },
        )

        else -> GagaLoading(
            message = when {
                state.callLaunched -> "Call in progress"
                state.phase == CallPhase.CONNECTING && !state.callingReady -> "Connecting\u2026"
                else -> "Starting call\u2026"
            },
        )
    }
}
