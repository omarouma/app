package app.gagachat.feature.calls.presentation

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Cameraswitch
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Headset
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.PhoneInTalk
import androidx.compose.material.icons.filled.PictureInPictureAlt
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaEmptyState
import app.gagachat.core.ui.component.GagaErrorState
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.theme.ErrorRed
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen
import app.gagachat.core.ui.theme.GagaGreenLight
import app.gagachat.core.ui.theme.WarningAmber
import app.gagachat.feature.calls.call.AudioDeviceInfo
import app.gagachat.feature.calls.call.AudioDeviceKind
import app.gagachat.feature.calls.call.CallDiagnostics
import app.gagachat.feature.calls.call.CallPeer
import app.gagachat.feature.calls.call.CallPipController
import io.livekit.android.renderer.SurfaceViewRenderer
import io.livekit.android.room.participant.ConnectionQuality
import kotlinx.coroutines.launch
import livekit.org.webrtc.RendererCommon
import java.util.Locale

/**
 * Full-screen call surface.
 *
 * Before the LiveKit migration this route only *launched* a prebuilt call UI
 * supplied by the old SDK, which then drew the entire call experience itself.
 * LiveKit is a media SDK with no UI of its own, so this file now owns the whole
 * in-call experience: the remote video surface, the local camera preview, the
 * peer identity, the live duration and the mute / speaker / camera / hang-up
 * controls.
 *
 * Two entry points share the same machinery:
 *  * [ActiveCallRoute] \u2014 an **outgoing** call started from a chat, a profile or
 *    the call history.
 *  * [IncomingCallRoute] \u2014 an **incoming** call, reached from the full-screen call
 *    notification (FCM) or from a live Supabase Realtime invite.
 *
 * Both request the runtime permissions the SDK needs before publishing media:
 * `CAMERA` for a video call and `RECORD_AUDIO` for any call. Without them the
 * room joins with a black tile and a muted mic \u2014 the classic "calling is
 * broken" symptom \u2014 so the media hand-off is gated on the grant.
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

    val requiredPermissions = remember(isVideo) { callPermissions(isVideo) }

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
        val missing = missingPermissions(context, requiredPermissions)
        if (missing.isEmpty()) {
            permissionsResolved = true
            permissionDenied = false
        } else {
            permissionLauncher.launch(missing)
        }
    }

    // Only place the call once the permissions are resolved and granted.
    LaunchedEffect(conversationId, attempt, permissionsResolved, permissionDenied) {
        if (conversationId != null && permissionsResolved && !permissionDenied) {
            viewModel.startCallForConversation(conversationId, isVideo)
        }
    }

    // Once the call has ended cleanly we step off the back stack so the user
    // lands straight back where they started.
    LaunchedEffect(state.phase, state.error) {
        if (state.phase == CallPhase.ENDED && state.error == null) onCallFinished()
    }

    BackHandler(enabled = state.phase != CallPhase.IDLE && state.phase != CallPhase.ENDED) {
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

        else -> CallSurface(state = state, viewModel = viewModel)
    }
}

/**
 * Incoming-call surface. Nothing is joined until the user actually accepts, so a
 * declined call never costs media time and never leaves a dangling room.
 */
@Composable
fun IncomingCallRoute(
    onCallFinished: () -> Unit,
    conversationId: String? = null,
    callId: String? = null,
    isVideo: Boolean = false,
    viewModel: CallViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val state by viewModel.state.collectAsStateWithLifecycle()
    var permissionDenied by remember { mutableStateOf(false) }

    val requiredPermissions = remember(isVideo) { callPermissions(isVideo) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        if (result.values.all { granted -> granted }) {
            viewModel.acceptCall()
        } else {
            permissionDenied = true
        }
    }

    LaunchedEffect(conversationId, callId) {
        if (conversationId != null) viewModel.prepareIncomingCall(conversationId, callId, isVideo)
    }

    // Declining, the caller hanging up and the ring timing out all land here.
    LaunchedEffect(state.phase) {
        if (state.phase == CallPhase.ENDED) onCallFinished()
    }

    BackHandler(enabled = state.phase != CallPhase.ENDED) {
        viewModel.rejectCall()
    }

    when {
        conversationId == null -> GagaEmptyState(
            icon = Icons.Filled.Call,
            title = "No active call",
            description = "This call is no longer available.",
            action = {
                GagaPrimaryButton(
                    text = "Close",
                    onClick = onCallFinished,
                    modifier = Modifier.padding(horizontal = GagaDimens.space32),
                )
            },
        )

        permissionDenied -> GagaErrorState(
            title = "Permission needed",
            description = if (isVideo) {
                "Allow camera and microphone access to answer video calls. " +
                    "Open Settings \u2192 Apps \u2192 GaGa Chat \u2192 Permissions to enable them."
            } else {
                "Allow microphone access to answer calls. " +
                    "Open Settings \u2192 Apps \u2192 GaGa Chat \u2192 Permissions to enable it."
            },
            onRetry = { permissionDenied = false },
        )

        state.phase == CallPhase.INCOMING_RINGING -> IncomingCallSurface(
            state = state,
            onAccept = {
                val missing = missingPermissions(context, requiredPermissions)
                if (missing.isEmpty()) viewModel.acceptCall()
                else permissionLauncher.launch(missing)
            },
            onDecline = viewModel::rejectCall,
        )

        state.phase == CallPhase.IDLE -> GagaLoading(message = "Connecting\u2026")

        else -> CallSurface(state = state, viewModel = viewModel)
    }
}

// ---- The call surface ------------------------------------------------------

/** Near-black canvas so the video and the controls always read clearly. */
private val CallBackground = Color(0xFF0B141A)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CallSurface(
    state: CallUiState,
    viewModel: CallViewModel,
) {
    val peer = state.primaryPeer
    val remoteVideoVisible = state.isVideoCall && peer?.isCameraEnabled == true && peer.videoTrackReady
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }

    val inPip by CallPipController.inPip.collectAsStateWithLifecycle()

    // Register the live call with the host Activity so it can auto-minimise on the
    // Home gesture, and keep the PiP params (aspect ratio + auto-enter) current as
    // the call switches between audio and video.
    DisposableEffect(activity, state.isVideoCall) {
        CallPipController.callActive = true
        CallPipController.isVideo = state.isVideoCall
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity?.let { act -> runCatching { act.setPictureInPictureParams(CallPipController.buildParams()) } }
        }
        onDispose { CallPipController.callActive = false }
    }

    var showAudioSheet by remember { mutableStateOf(false) }
    var showDiagnostics by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(CallBackground),
    ) {
        if (state.isVideoCall) {
            RemoteVideoSurface(
                state = state,
                viewModel = viewModel,
                peer = peer,
                visible = remoteVideoVisible,
            )
        }

        if (!remoteVideoVisible) {
            PeerPortrait(state = state, peer = peer)
        }

        if (state.isVideoCall && state.isVideoEnabled) {
            LocalVideoPreview(state = state, viewModel = viewModel)
        }

        // Inside the PiP window there is no room for chrome: the media is the UI.
        if (!inPip) {
            CallHeader(state = state, modifier = Modifier.align(Alignment.TopCenter))
            CallQuickActions(
                onAudioRoute = { showAudioSheet = true },
                onDiagnostics = { showDiagnostics = true },
                onMinimise = {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        activity?.let { act ->
                            runCatching { act.enterPictureInPictureMode(CallPipController.buildParams()) }
                        }
                    }
                },
                modifier = Modifier.align(Alignment.TopEnd),
            )
            CallControls(state = state, viewModel = viewModel, modifier = Modifier.align(Alignment.BottomCenter))
        }
    }

    if (showAudioSheet) {
        AudioDeviceSheet(
            devices = state.audioDevices,
            current = state.currentAudioDevice,
            onSelect = { id ->
                viewModel.selectAudioDevice(id)
                showAudioSheet = false
            },
            onDismiss = { showAudioSheet = false },
        )
    }

    if (showDiagnostics) {
        DiagnosticsSheet(
            diagnostics = state.diagnostics,
            onDismiss = { showDiagnostics = false },
        )
    }
}

/**
 * Small vertical stack of secondary call actions pinned to the top-right:
 * audio-route picker, live diagnostics and "minimise" (Picture-in-Picture).
 * Kept out of the primary control row so the essential controls stay uncluttered.
 */
@Composable
private fun CallQuickActions(
    onAudioRoute: () -> Unit,
    onDiagnostics: () -> Unit,
    onMinimise: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(top = 52.dp, end = GagaDimens.space8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(GagaDimens.space8),
    ) {
        QuickActionButton(icon = Icons.Filled.Headset, label = "Audio", onClick = onAudioRoute)
        QuickActionButton(icon = Icons.Filled.Info, label = "Stats", onClick = onDiagnostics)
        QuickActionButton(icon = Icons.Filled.PictureInPictureAlt, label = "Minimise", onClick = onMinimise)
    }
}

@Composable
private fun QuickActionButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.16f))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = Color.White,
            modifier = Modifier.size(GagaDimens.iconSmall),
        )
    }
}

/**
 * Bottom sheet listing every audio output the SDK currently exposes, with the
 * active route ticked. The list is live: plugging in a headset mid-call makes it
 * appear here without leaving the call.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AudioDeviceSheet(
    devices: List<AudioDeviceInfo>,
    current: AudioDeviceInfo?,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    val scope = rememberCoroutineScope()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Text(
            text = "Audio output",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = GagaDimens.space20, end = GagaDimens.space20, bottom = GagaDimens.space8),
        )
        if (devices.isEmpty()) {
            Text(
                text = "No audio outputs available yet.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = GagaDimens.space20, vertical = GagaDimens.space12),
            )
        } else {
            devices.forEach { device ->
                val selected = device.id == current?.id
                ListItem(
                    headlineContent = { Text(device.label) },
                    supportingContent = { Text(deviceKindLabel(device.kind)) },
                    leadingContent = {
                        Icon(
                            imageVector = deviceKindIcon(device.kind),
                            contentDescription = null,
                            tint = if (selected) GagaGreen else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    },
                    trailingContent = {
                        if (selected) {
                            Icon(
                                imageVector = Icons.Filled.Check,
                                contentDescription = "Selected",
                                tint = GagaGreen,
                                modifier = Modifier.size(GagaDimens.iconSmall),
                            )
                        }
                    },
                    colors = ListItemDefaults.colors(
                        containerColor = if (selected) GagaGreen.copy(alpha = 0.10f) else Color.Transparent,
                    ),
                    modifier = Modifier.clickable {
                        scope.launch { runCatching { sheetState.hide() } }.invokeOnCompletion { onSelect(device.id) }
                    },
                )
                HorizontalDivider()
            }
        }
        Spacer(Modifier.height(GagaDimens.space16))
        Spacer(Modifier.navigationBarsPadding())
    }
}

/**
 * Live, read-only view of the media session: the room, the negotiated features
 * (adaptive stream / dynacast), the peer count, reconnect count, link quality and
 * the active audio route. Everything shown is read straight off the LiveKit SDK.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DiagnosticsSheet(
    diagnostics: CallDiagnostics,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Text(
            text = "Call diagnostics",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = GagaDimens.space20, end = GagaDimens.space20, bottom = GagaDimens.space8),
        )
        Column(modifier = Modifier.padding(horizontal = GagaDimens.space20)) {
            DiagnosticRow("Type", if (diagnostics.isVideo) "Video call" else "Voice call")
            DiagnosticRow("Quality", diagnostics.connectionQuality.name.lowercase().replaceFirstChar { it.uppercase() })
            DiagnosticRow("Participants", diagnostics.peerCount.toString())
            DiagnosticRow("Reconnects", diagnostics.reconnectCount.toString())
            DiagnosticRow("Adaptive stream", if (diagnostics.adaptiveStream) "On" else "Off")
            DiagnosticRow("Dynacast", if (diagnostics.dynacast) "On" else "Off")
            diagnostics.audioDeviceLabel?.let { DiagnosticRow("Audio output", it) }
            diagnostics.roomName?.let { DiagnosticRow("Room", it) }
        }
        Spacer(Modifier.height(GagaDimens.space16))
        Spacer(Modifier.navigationBarsPadding())
    }
}

@Composable
private fun DiagnosticRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = GagaDimens.space8),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

private fun deviceKindIcon(kind: AudioDeviceKind): ImageVector = when (kind) {
    AudioDeviceKind.SPEAKER -> Icons.AutoMirrored.Filled.VolumeUp
    AudioDeviceKind.EARPIECE -> Icons.Filled.PhoneInTalk
    AudioDeviceKind.BLUETOOTH -> Icons.Filled.Bluetooth
    AudioDeviceKind.WIRED -> Icons.Filled.Headset
    AudioDeviceKind.OTHER -> Icons.AutoMirrored.Filled.VolumeUp
}

private fun deviceKindLabel(kind: AudioDeviceKind): String = when (kind) {
    AudioDeviceKind.SPEAKER -> "Loudspeaker"
    AudioDeviceKind.EARPIECE -> "Phone earpiece"
    AudioDeviceKind.BLUETOOTH -> "Bluetooth"
    AudioDeviceKind.WIRED -> "Wired headset"
    AudioDeviceKind.OTHER -> "Audio device"
}

/**
 * The remote participant's camera, rendered full-bleed. The renderer is always
 * composed for a video call (even before the peer's track arrives) so it is
 * initialised against the room's EGL context exactly once; the avatar overlay
 * covers it until frames actually flow.
 */
@Composable
private fun RemoteVideoSurface(
    state: CallUiState,
    viewModel: CallViewModel,
    peer: CallPeer?,
    visible: Boolean,
) {
    val renderer = remember { mutableStateOf<SurfaceViewRenderer?>(null) }

    AndroidView(
        factory = { context ->
            SurfaceViewRenderer(context).apply {
                setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                setEnableHardwareScaler(true)
                renderer.value = this
            }
        },
        modifier = Modifier
            .fillMaxSize()
            .alpha(if (visible) 1f else 0f),
    )

    // Keyed on the renderer instance so the attach happens as soon as the view
    // exists, and again whenever the peer or their camera track changes.
    LaunchedEffect(renderer.value, state.callLaunched, peer?.identity, peer?.isCameraEnabled, peer?.videoTrackReady) {
        val view = renderer.value ?: return@LaunchedEffect
        viewModel.initVideoRenderer(view)
        peer?.identity?.let { identity -> viewModel.attachRemoteVideo(view, identity) }
    }

    DisposableEffect(Unit) {
        onDispose { renderer.value?.let { view -> viewModel.detachRenderer(view); runCatching { view.release() } } }
    }
}

/** Small mirrored self-view, pinned to the top-right corner. */
@Composable
private fun LocalVideoPreview(
    state: CallUiState,
    viewModel: CallViewModel,
) {
    val renderer = remember { mutableStateOf<SurfaceViewRenderer?>(null) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 132.dp, end = GagaDimens.space16),
        contentAlignment = Alignment.TopEnd,
    ) {
        AndroidView(
            factory = { context ->
                SurfaceViewRenderer(context).apply {
                    setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                    setMirror(true)
                    setEnableHardwareScaler(true)
                    renderer.value = this
                }
            },
            modifier = Modifier
                .width(112.dp)
                .aspectRatio(0.72f)
                .clip(RoundedCornerShape(GagaDimens.space12))
                .background(Color.Black),
        )
    }

    LaunchedEffect(renderer.value, state.callLaunched, state.isVideoEnabled) {
        val view = renderer.value ?: return@LaunchedEffect
        viewModel.initVideoRenderer(view)
        if (state.isVideoEnabled) viewModel.attachLocalVideo(view)
    }

    DisposableEffect(Unit) {
        onDispose { renderer.value?.let { view -> viewModel.detachRenderer(view); runCatching { view.release() } } }
    }
}

/** Avatar + name, shown for audio calls and whenever the peer's camera is off. */
@Composable
private fun PeerPortrait(state: CallUiState, peer: CallPeer?) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        GagaAvatar(
            imageUrl = state.peerAvatar,
            name = state.peerName,
            size = 140.dp,
        )
        Spacer(Modifier.height(GagaDimens.space20))
        Text(
            text = state.peerName ?: "GaGa User",
            color = Color.White,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (peer?.isSpeaking == true) {
            Spacer(Modifier.height(GagaDimens.space6))
            Text(
                text = "Speaking",
                color = GagaGreenLight,
                style = MaterialTheme.typography.labelMedium,
            )
        }
    }
}

@Composable
private fun CallHeader(state: CallUiState, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 56.dp, start = GagaDimens.space24, end = GagaDimens.space24),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = state.peerName ?: "GaGa call",
            color = Color.White,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(GagaDimens.space6))
        Text(
            text = statusText(state),
            color = Color.White.copy(alpha = 0.8f),
            style = MaterialTheme.typography.bodyMedium,
        )
        state.mediaNotice?.let { Text(it, color = WarningAmber, style = MaterialTheme.typography.bodySmall) }
        qualityLabel(state.connectionQuality)?.let { label ->
            Spacer(Modifier.height(GagaDimens.space4))
            Text(
                text = label,
                color = WarningAmber,
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}

@Composable
private fun CallControls(
    state: CallUiState,
    viewModel: CallViewModel,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(bottom = 32.dp, start = GagaDimens.space16, end = GagaDimens.space16),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CallControlButton(
            icon = if (state.isMuted) Icons.Filled.MicOff else Icons.Filled.Mic,
            label = if (state.isMuted) "Unmute" else "Mute",
            active = state.isMuted,
            onClick = viewModel::toggleMute,
        )
        CallControlButton(
            icon = if (state.isSpeakerOn) Icons.AutoMirrored.Filled.VolumeUp else Icons.AutoMirrored.Filled.VolumeOff,
            label = "Speaker",
            active = state.isSpeakerOn,
            onClick = viewModel::toggleSpeaker,
        )
        if (state.isVideoCall) {
            CallControlButton(
                icon = if (state.isVideoEnabled) Icons.Filled.Videocam else Icons.Filled.VideocamOff,
                label = "Camera",
                active = !state.isVideoEnabled,
                onClick = viewModel::toggleVideo,
            )
            CallControlButton(
                icon = Icons.Filled.Cameraswitch,
                label = "Flip",
                onClick = viewModel::switchCamera,
            )
        }
        CallControlButton(
            icon = Icons.Filled.CallEnd,
            label = "End",
            danger = true,
            onClick = viewModel::endCall,
        )
    }
}

@Composable
private fun IncomingCallSurface(
    state: CallUiState,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(CallBackground),
    ) {
        PeerPortrait(state = state, peer = state.primaryPeer)

        Text(
            text = if (state.isVideoCall) "Incoming video call" else "Incoming voice call",
            color = Color.White.copy(alpha = 0.85f),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 64.dp),
        )

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(bottom = 56.dp, start = GagaDimens.space32, end = GagaDimens.space32),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CallControlButton(
                icon = Icons.Filled.CallEnd,
                label = "Decline",
                danger = true,
                onClick = onDecline,
            )
            CallControlButton(
                icon = Icons.Filled.Call,
                label = "Accept",
                accept = true,
                onClick = onAccept,
            )
        }
    }
}

/**
 * Circular control with a caption. [active] marks a control that is in its
 * non-default state (muted, camera off, speaker on) so the engaged state is
 * obvious at a glance; [danger] is hang-up red and [accept] is brand green.
 */
@Composable
private fun CallControlButton(
    icon: ImageVector,
    label: String,
    active: Boolean = false,
    danger: Boolean = false,
    accept: Boolean = false,
    onClick: () -> Unit,
) {
    val background = when {
        danger -> ErrorRed
        accept -> GagaGreen
        active -> Color.White
        else -> Color.White.copy(alpha = 0.18f)
    }
    val tint = if (active && !danger && !accept) CallBackground else Color.White

    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(60.dp)
                .clip(CircleShape)
                .background(background)
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = tint,
                modifier = Modifier.size(GagaDimens.iconMedium),
            )
        }
        Spacer(Modifier.height(GagaDimens.space6))
        Text(
            text = label,
            color = Color.White.copy(alpha = 0.8f),
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
        )
    }
}

// ---- Helpers ---------------------------------------------------------------

private fun callPermissions(isVideo: Boolean): Array<String> =
    if (isVideo) {
        arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
    } else {
        arrayOf(Manifest.permission.RECORD_AUDIO)
    }

private fun missingPermissions(
    context: android.content.Context,
    required: Array<String>,
): Array<String> = required
    .filter { context.checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
    .toTypedArray()

/** Unwraps the host [Activity] from a Compose [Context] (needed for PiP calls). */
private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

/**
 * The one-line state under the peer's name. "Ringing\u2026" is honest about the fact
 * that LiveKit has no ring concept \u2014 we are in the room, waiting for the other
 * party to accept.
 */
private fun statusText(state: CallUiState): String = when (state.phase) {
    CallPhase.IDLE -> "Connecting\u2026"
    CallPhase.OUTGOING_RINGING -> "Ringing\u2026"
    CallPhase.INCOMING_RINGING ->
        if (state.isVideoCall) "Incoming video call" else "Incoming voice call"

    CallPhase.CONNECTING ->
        if (state.callingReady) "Waiting for the other person\u2026" else "Connecting\u2026"

    CallPhase.CONNECTED ->
        if (state.elapsedSeconds > 0L) formatDuration(state.elapsedSeconds) else "Connected"

    CallPhase.ENDED -> "Call ended"
}

private fun formatDuration(seconds: Long): String {
    val total = seconds.coerceAtLeast(0L)
    val hours = total / 3600
    val minutes = (total % 3600) / 60
    val secs = total % 60
    return if (hours > 0) {
        String.format(Locale.US, "%d:%02d:%02d", hours, minutes, secs)
    } else {
        String.format(Locale.US, "%d:%02d", minutes, secs)
    }
}

/** Only surfaces a problem; an excellent/good link needs no caption. */
private fun qualityLabel(quality: ConnectionQuality): String? = when (quality) {
    ConnectionQuality.POOR -> "Poor connection"
    ConnectionQuality.LOST -> "Connection lost"
    else -> null
}
