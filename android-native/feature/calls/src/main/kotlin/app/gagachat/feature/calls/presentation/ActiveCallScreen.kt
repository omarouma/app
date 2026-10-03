package app.gagachat.feature.calls.presentation

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
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
 * Before handing off it requests the runtime permissions the SDK needs \u2014
 * `CAMERA` for a video call and `RECORD_AUDIO` for any call. Without them the SDK
 * joins the room with a black/frozen tile and a muted mic (the classic "video
 * calling is broken" symptom), so we gate the hand-off on the grant.
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
    val context = LocalContext.current
    val state by viewModel.state.collectAsStateWithLifecycle()

    // Bumping this re-runs the launcher so "Retry" genuinely re-attempts the call
    // (e.g. after the contact registers with calling, or the network recovers).
    var attempt by remember { mutableIntStateOf(0) }

    // Permissions the SDK needs before it can publish local media.
    val requiredPermissions = remember(isVideo) {
        if (isVideo) {
            arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
        } else {
            arrayOf(Manifest.permission.RECORD_AUDIO)
        }
    }

    // Reset per attempt so a Retry re-evaluates (and can re-prompt).
    var permissionsResolved by remember(conversationId, attempt) { mutableStateOf(false) }
    var permissionDenied by remember(conversationId, attempt) { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        permissionsResolved = true
        permissionDenied = result.values.any { granted -> !granted }
    }

    // Ask for anything still missing the moment the route is composed.
    LaunchedEffect(conversationId, attempt) {
        if (conversationId == null) return@LaunchedEffect
        val missing = requiredPermissions.filter {
            context.checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) {
            permissionsResolved = true
            permissionDenied = false
        } else {
            permissionLauncher.launch(missing.toTypedArray())
        }
    }

    // Only hand off to the SDK once the permissions are resolved and granted.
    LaunchedEffect(conversationId, attempt, permissionsResolved, permissionDenied) {
        if (conversationId != null && permissionsResolved && !permissionDenied) {
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
        permissionDenied -> GagaErrorState(
            title = "Permission needed",
            description = if (isVideo) {
                "Allow camera and microphone access to make video calls. " +
                    "Open Settings \u2192 Apps \u2192 GaGa Chat \u2192 Permissions to enable them."
            } else {
                "Allow microphone access to make calls. " +
                    "Open Settings \u2192 Apps \u2192 GaGa Chat \u2192 Permissions to enable it."
            },
            onRetry = {
                viewModel.dismissEnded()
                attempt++
            },
        )

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
