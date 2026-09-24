package app.gagachat.feature.calls.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.CallType
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.util.TimeFormat

/**
 * Full-screen call surface. Handles incoming ringing, outgoing ringing and the
 * connected state in a single composable so navigation stays simple.
 */
@Composable
fun ActiveCallRoute(
    onCallFinished: () -> Unit,
    conversationId: String? = null,
    isVideo: Boolean = false,
    viewModel: CallViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val call = state.activeCall

    // Outgoing call initiated from chat/profile: resolve the peer and start.
    LaunchedEffect(conversationId) {
        if (conversationId != null && state.phase == CallPhase.IDLE) {
            viewModel.startCallForConversation(conversationId, isVideo)
        }
    }

    if (call == null || state.phase == CallPhase.IDLE) {
        return
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(GagaDimens.space24),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            GagaAvatar(
                imageUrl = call.peerAvatar,
                name = call.peerName,
                size = GagaDimens.avatarXLarge,
            )
            Spacer(Modifier.height(GagaDimens.space20))
            Text(
                text = call.peerName ?: "Unknown",
                style = MaterialTheme.typography.headlineSmall,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(GagaDimens.space8))
            Text(
                text = phaseLabel(state),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }

        CallControls(
            state = state,
            onAccept = viewModel::acceptCall,
            onReject = viewModel::rejectCall,
            onEnd = viewModel::endCall,
            onToggleMute = viewModel::toggleMute,
            onToggleSpeaker = viewModel::toggleSpeaker,
            onToggleVideo = viewModel::toggleVideo,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(bottom = GagaDimens.space48),
        )
    }
}

@Composable
private fun CallControls(
    state: CallUiState,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onEnd: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleSpeaker: () -> Unit,
    onToggleVideo: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (state.phase) {
        CallPhase.INCOMING_RINGING -> {
            Row(
                modifier = modifier,
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CallActionButton(
                    icon = Icons.Filled.CallEnd,
                    label = "Decline",
                    background = MaterialTheme.colorScheme.error,
                    onClick = onReject,
                )
                CallActionButton(
                    icon = Icons.Filled.Call,
                    label = "Accept",
                    background = MaterialTheme.colorScheme.primary,
                    onClick = onAccept,
                )
            }
        }
        CallPhase.OUTGOING_RINGING, CallPhase.CONNECTING -> {
            Row(
                modifier = modifier,
                horizontalArrangement = Arrangement.Center,
            ) {
                CallActionButton(
                    icon = Icons.Filled.CallEnd,
                    label = "Cancel",
                    background = MaterialTheme.colorScheme.error,
                    onClick = onEnd,
                )
            }
        }
        CallPhase.CONNECTED -> {
            Row(
                modifier = modifier,
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CallActionButton(
                    icon = if (state.isMuted) Icons.Filled.MicOff else Icons.Filled.Mic,
                    label = if (state.isMuted) "Unmute" else "Mute",
                    background = MaterialTheme.colorScheme.surfaceVariant,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    onClick = onToggleMute,
                )
                CallActionButton(
                    icon = if (state.isSpeakerOn) Icons.Filled.VolumeUp else Icons.Filled.VolumeOff,
                    label = "Speaker",
                    background = MaterialTheme.colorScheme.surfaceVariant,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    onClick = onToggleSpeaker,
                )
                CallActionButton(
                    icon = if (state.isVideoEnabled) Icons.Filled.Videocam else Icons.Filled.VideocamOff,
                    label = "Video",
                    background = MaterialTheme.colorScheme.surfaceVariant,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    onClick = onToggleVideo,
                )
                CallActionButton(
                    icon = Icons.Filled.CallEnd,
                    label = "End",
                    background = MaterialTheme.colorScheme.error,
                    onClick = onEnd,
                )
            }
        }
        else -> Unit
    }
}

@Composable
private fun CallActionButton(
    icon: ImageVector,
    label: String,
    background: Color,
    onClick: () -> Unit,
    tint: Color = Color.White,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(CircleShape)
                .background(background),
            contentAlignment = Alignment.Center,
        ) {
            IconButton(onClick = onClick) {
                Icon(imageVector = icon, contentDescription = label, tint = tint)
            }
        }
        Spacer(Modifier.height(GagaDimens.space8))
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun phaseLabel(state: CallUiState): String {
    val kind = if (state.activeCall?.type == CallType.VIDEO) "Video call" else "Voice call"
    return when (state.phase) {
        CallPhase.INCOMING_RINGING -> "Incoming $kind"
        CallPhase.OUTGOING_RINGING -> "Calling\u2026"
        CallPhase.CONNECTING -> "Connecting\u2026"
        CallPhase.CONNECTED -> TimeFormat.callDuration(state.elapsedSeconds * 1000L)
        CallPhase.ENDED -> "Call ended"
        CallPhase.IDLE -> ""
    }
}
