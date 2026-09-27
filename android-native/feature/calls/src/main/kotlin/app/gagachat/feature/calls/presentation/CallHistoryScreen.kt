package app.gagachat.feature.calls.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CallMade
import androidx.compose.material.icons.automirrored.filled.CallMissed
import androidx.compose.material.icons.automirrored.filled.CallReceived
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.CallSession
import app.gagachat.core.model.CallStatus
import app.gagachat.core.model.CallType
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaEmptyState
import app.gagachat.core.ui.component.GagaErrorState
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.util.TimeFormat

@Composable
fun CallHistoryRoute(
    onNavigateBack: () -> Unit,
    onOpenConversation: (String) -> Unit,
    onStartCall: (conversationId: String, isVideo: Boolean) -> Unit,
    viewModel: CallViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var selectedTab by remember { mutableIntStateOf(0) }

    val visibleCalls = remember(state.history, selectedTab) {
        if (selectedTab == 1) state.history.filter { it.isMissedCall() } else state.history
    }

    GagaScaffold(title = "Calls", onBack = onNavigateBack) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            TabRow(selectedTabIndex = selectedTab) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("All") },
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("Missed") },
                )
            }
            when {
                state.isLoading && state.history.isEmpty() -> {
                    GagaLoading(modifier = Modifier.padding(top = GagaDimens.space24))
                }
                state.error != null && state.history.isEmpty() -> {
                    GagaErrorState(
                        title = "Couldn't load calls",
                        description = state.error,
                        onRetry = viewModel::refreshHistory,
                    )
                }
                visibleCalls.isEmpty() -> {
                    GagaEmptyState(
                        icon = Icons.Filled.Call,
                        title = if (selectedTab == 1) "No missed calls" else "No calls yet",
                        description = if (selectedTab == 1) {
                            "You're all caught up."
                        } else {
                            "Your voice and video call history will appear here."
                        },
                    )
                }
                else -> {
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        items(visibleCalls, key = { it.id }) { call ->
                            CallHistoryRow(
                                call = call,
                                onClick = { onOpenConversation(call.conversationId) },
                                onCall = { onStartCall(call.conversationId, false) },
                                onVideoCall = { onStartCall(call.conversationId, true) },
                            )
                            GagaDivider()
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CallHistoryRow(
    call: CallSession,
    onClick: () -> Unit,
    onCall: () -> Unit,
    onVideoCall: () -> Unit,
) {
    val missed = call.isMissedCall()
    val directionIcon = when {
        missed -> Icons.AutoMirrored.Filled.CallMissed
        call.isOutgoing -> Icons.AutoMirrored.Filled.CallMade
        else -> Icons.AutoMirrored.Filled.CallReceived
    }
    val directionColor = if (missed) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(start = GagaDimens.space16, end = GagaDimens.space8, top = GagaDimens.space12, bottom = GagaDimens.space12),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GagaAvatar(
            imageUrl = call.peerAvatar,
            name = call.peerName?.takeIf { it.isNotBlank() } ?: "GaGa User",
            size = GagaDimens.avatarMedium,
        )
        Spacer(Modifier.width(GagaDimens.space12))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = call.peerName?.takeIf { it.isNotBlank() } ?: "GaGa User",
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(GagaDimens.space2))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = directionIcon,
                    contentDescription = null,
                    tint = directionColor,
                    modifier = Modifier.size(GagaDimens.iconSmall),
                )
                Spacer(Modifier.width(GagaDimens.space4))
                Text(
                    text = callSubtitle(call),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        IconButton(onClick = onCall) {
            Icon(
                imageVector = Icons.Filled.Call,
                contentDescription = "Voice call",
                tint = MaterialTheme.colorScheme.primary,
            )
        }
        IconButton(onClick = onVideoCall) {
            Icon(
                imageVector = Icons.Filled.Videocam,
                contentDescription = "Video call",
                tint = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

private fun CallSession.isMissedCall(): Boolean =
    status == CallStatus.MISSED || status == CallStatus.REJECTED || status == CallStatus.BUSY

private fun callSubtitle(call: CallSession): String {
    val time = TimeFormat.conversationTime(call.startedAt)
    val detail = when (call.status) {
        CallStatus.MISSED -> "Missed"
        CallStatus.REJECTED -> "Declined"
        CallStatus.BUSY -> "Busy"
        CallStatus.FAILED -> "Failed"
        CallStatus.RINGING -> "Ringing"
        CallStatus.CONNECTING -> "Connecting"
        else -> call.durationMs?.let { TimeFormat.callDuration(it) } ?: "Ended"
    }
    return "$detail \u2022 $time"
}
