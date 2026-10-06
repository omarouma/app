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
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
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
import app.gagachat.core.ui.component.GagaSearchBar
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.util.TimeFormat
import java.util.Locale

/**
 * Call history surface (screenshot 173830). Shows a summary subtitle
 * ("N total • M missed"), a name search field, All/Missed tabs, and the list
 * grouped under TODAY / YESTERDAY / date section headers.
 */
@Composable
fun CallHistoryRoute(
    onNavigateBack: () -> Unit,
    onOpenConversation: (String) -> Unit,
    onStartCall: (conversationId: String, isVideo: Boolean) -> Unit,
    viewModel: CallViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }
    var query by rememberSaveable { mutableStateOf("") }
    var confirmClear by remember { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf<String?>(null) }
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it) } }

    val allCalls = state.history
    val missedCount = remember(allCalls) { allCalls.count { it.isMissedCall() } }
    val subtitle = if (allCalls.isEmpty()) {
        null
    } else {
        "${allCalls.size} total \u2022 $missedCount missed"
    }

    val visibleCalls = remember(allCalls, selectedTab, query) {
        allCalls
            .filter { selectedTab == 0 || it.isMissedCall() }
            .filter {
                query.isBlank() ||
                    (it.peerName ?: "").contains(query, ignoreCase = true)
            }
    }

    // History arrives sorted newest-first, so grouping preserves TODAY → YESTERDAY → older.
    val sections = remember(visibleCalls) {
        visibleCalls
            .groupBy { TimeFormat.daySeparator(it.startedAt).uppercase(Locale.getDefault()) }
            .toList()
    }

    GagaScaffold(
        title = "Calls",
        subtitle = subtitle,
        snackbarHostState = snackbar,
        onBack = onNavigateBack,
        actions = {
            IconButton(onClick = viewModel::refreshHistory) { Icon(Icons.Filled.Refresh, "Refresh call history") }
            if (allCalls.isNotEmpty()) {
                IconButton(onClick = { confirmClear = true }) {
                    Icon(
                        imageVector = Icons.Filled.DeleteSweep,
                        contentDescription = "Clear call history",
                    )
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            GagaSearchBar(
                query = query,
                onQueryChange = { query = it },
                placeholder = "Search by name...",
            )
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
                state.isLoading && allCalls.isEmpty() -> {
                    GagaLoading(modifier = Modifier.padding(top = GagaDimens.space24))
                }
                state.error != null && allCalls.isEmpty() -> {
                    GagaErrorState(
                        title = "Couldn't load calls",
                        description = state.error,
                        onRetry = viewModel::refreshHistory,
                    )
                }
                visibleCalls.isEmpty() -> {
                    GagaEmptyState(
                        icon = Icons.Filled.Call,
                        title = when {
                            query.isNotBlank() -> "No matching calls"
                            selectedTab == 1 -> "No missed calls"
                            else -> "No calls yet"
                        },
                        description = when {
                            query.isNotBlank() -> "Try a different name."
                            selectedTab == 1 -> "You're all caught up."
                            else -> "Your voice and video call history will appear here."
                        },
                    )
                }
                else -> {
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        sections.forEach { (label, calls) ->
                            item(key = "header_$label") {
                                GagaSectionHeader(text = label)
                            }
                            items(calls, key = { it.id }) { call ->
                                CallHistoryRow(
                                    call = call,
                                    onClick = { onOpenConversation(call.conversationId) },
                                    onCall = { onStartCall(call.conversationId, false) },
                                    onVideoCall = { onStartCall(call.conversationId, true) },
                                    onDelete = { pendingDelete = call.id },
                                )
                                GagaDivider()
                            }
                        }
                    }
                }
            }
        }
    }
    pendingDelete?.let { id ->
        AlertDialog(onDismissRequest = { pendingDelete = null }, title = { Text("Remove call record?") },
            text = { Text("This removes the record from your call history.") },
            confirmButton = { TextButton(onClick = { viewModel.deleteCall(id); pendingDelete = null }) { Text("Remove") } },
            dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("Cancel") } })
    }

    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("Clear call history?") },
            text = { Text("This removes every call from your history on this device.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.clearHistory()
                        confirmClear = false
                    },
                ) { Text("Clear") }
            },
            dismissButton = {
                TextButton(onClick = { confirmClear = false }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun CallHistoryRow(
    call: CallSession,
    onClick: () -> Unit,
    onCall: () -> Unit,
    onVideoCall: () -> Unit,
    onDelete: () -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
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
            .padding(start = GagaDimens.space16, end = GagaDimens.space4, top = GagaDimens.space12, bottom = GagaDimens.space12),
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
        Box {
            IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "Call options") }
            DropdownMenu(menu, { menu = false }) {
                DropdownMenuItem(text = { Text("Video call") }, onClick = { menu = false; onVideoCall() })
                DropdownMenuItem(text = { Text("Remove record") }, onClick = { menu = false; onDelete() })
            }
        }
    }
}

private fun CallSession.isMissedCall(): Boolean =
    !isOutgoing && status == CallStatus.MISSED

/** e.g. "Missed • Voice • 5h ago" or "Outgoing • Video • 1:27". */
private fun callSubtitle(call: CallSession): String {
    val direction = when {
        call.isMissedCall() -> "Missed"
        call.status == CallStatus.MISSED -> "No answer"
        call.status == CallStatus.REJECTED -> "Declined"
        call.status == CallStatus.BUSY -> "Busy"
        call.status == CallStatus.FAILED -> "Failed"
        call.isOutgoing -> "Outgoing"
        else -> "Incoming"
    }
    val kind = if (call.type == CallType.VIDEO) "Video" else "Voice"
    val tail = call.durationMs
        ?.takeIf { it > 0L }
        ?.let { TimeFormat.callDuration(it) }
        ?: TimeFormat.callRelativeTime(call.startedAt)
    return "$direction \u2022 $kind \u2022 $tail"
}
