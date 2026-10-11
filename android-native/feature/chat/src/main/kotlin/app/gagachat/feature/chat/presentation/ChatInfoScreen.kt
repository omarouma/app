package app.gagachat.feature.chat.presentation

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.Message
import app.gagachat.feature.chat.presentation.components.MediaViewerOverlay
import app.gagachat.feature.chat.presentation.components.rememberSignedMediaUrl
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.theme.GagaDimens
import coil.compose.SubcomposeAsyncImage

/**
 * Chat Info + shared-media gallery (Phase 10.2/10.3). A single scrollable surface
 * with the peer's identity, quick actions, a photo/video gallery, shared files,
 * links and shared contacts/locations.
 */
@Composable
fun ChatInfoRoute(
    onNavigateBack: () -> Unit,
    onStartCall: (conversationId: String, isVideo: Boolean) -> Unit,
    onOpenProfile: (userId: String) -> Unit,
    onSendMoney: () -> Unit,
    viewModel: ChatInfoViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val notice by viewModel.notice.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(notice) {
        notice?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeNotice()
        }
    }

    var showReport by remember { mutableStateOf(false) }
    var selectedMedia by remember { mutableStateOf<Message?>(null) }
    if (showReport) androidx.compose.material3.AlertDialog(
        onDismissRequest = { showReport = false },
        title = { Text("Report this user") },
        text = { Column {
            Text("Select a reason. Your account, this contact and the reason will be sent for review. Messages are not included.")
            listOf("Spam", "Harassment", "Scam", "Other").forEach { reason ->
                androidx.compose.material3.TextButton(onClick = { showReport = false; viewModel.reportUser(reason) }) { Text(reason) }
            }
        } },
        confirmButton = { androidx.compose.material3.TextButton(onClick = { showReport = false }) { Text("Cancel") } },
    )
    GagaScaffold(
        title = "Chat Info",
        onBack = onNavigateBack,
        snackbarHostState = snackbarHostState,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            // Identity header.
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = GagaDimens.space16),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                GagaAvatar(
                    imageUrl = state.avatarUrl,
                    name = state.title,
                    size = GagaDimens.avatarLarge,
                    status = state.status,
                    showStatus = true,
                    modifier = Modifier.clickable {
                        if (state.otherUserId.isNotBlank()) onOpenProfile(state.otherUserId)
                    },
                )
                Spacer(Modifier.height(GagaDimens.space12))
                Text(
                    text = state.title,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                val bio = state.bio
                if (!bio.isNullOrBlank()) {
                    Spacer(Modifier.height(GagaDimens.space4))
                    Text(
                        text = bio,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // Quick actions.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space16),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                InfoAction(Icons.Filled.Call, "Voice") {
                    onStartCall(state.conversationId, false)
                }
                InfoAction(Icons.Filled.Videocam, "Video") {
                    onStartCall(state.conversationId, true)
                }
                InfoAction(Icons.Filled.Search, "Search") {
                    onNavigateBack()
                }
                InfoAction(Icons.Filled.Person, "Profile") {
                    val uid = state.otherUserId
                    if (uid.isNotBlank()) onOpenProfile(uid)
                }
            }

            Spacer(Modifier.height(GagaDimens.space16))

            // The gallery must use the same private-media URL resolver as the
            // chatroom. A raw private bucket URL can show a blank gray tile.
            GagaSectionHeader("Photos & Videos (${state.media.size})")
            if (state.media.isEmpty()) {
                EmptyRow("No shared photos or videos yet.")
            } else {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = GagaDimens.space8),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    state.media.chunked(3).forEach { items ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            items.forEach { item ->
                                SharedMediaThumbnail(
                                    item = item,
                                    modifier = Modifier.weight(1f).aspectRatio(1f),
                                    onClick = { selectedMedia = item.message },
                                )
                            }
                            repeat(3 - items.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }

            // Files.
            GagaSectionHeader("Files (${state.files.size})")
            if (state.files.isEmpty()) {
                EmptyRow("No shared files yet.")
            } else {
                state.files.forEach { file ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.Description, contentDescription = null)
                        Spacer(Modifier.width(GagaDimens.space12))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = file.name,
                                style = MaterialTheme.typography.bodyMedium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            file.size?.let {
                                Text(
                                    text = formatBytes(it),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }

            // Links.
            GagaSectionHeader("Links (${state.links.size})")
            if (state.links.isEmpty()) {
                EmptyRow("No shared links yet.")
            } else {
                state.links.forEach { link ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.Link, contentDescription = null)
                        Spacer(Modifier.width(GagaDimens.space12))
                        Text(
                            text = link.url,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            // Shared extras.
            GagaSectionHeader("Shared")
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
                horizontalArrangement = Arrangement.spacedBy(GagaDimens.space24),
            ) {
                StatChip(Icons.Filled.Person, "${state.contactCount} contacts")
                StatChip(Icons.Filled.LocationOn, "${state.locationCount} locations")
            }
            Text(
                text = "${state.messageCount} messages in this conversation",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
            )

            // Management — destructive / moderation actions live here rather
            // than in the chat overflow menu, so the menu stays a short list of
            // everyday actions and the risky ones sit behind one extra tap (P1).
            GagaSectionHeader("Manage")
            ManagementRow(
                icon = Icons.Filled.Delete,
                label = "Clear Chat",
                description = "Remove this conversation's messages from this device.",
                onClick = viewModel::clearChat,
            )
            ManagementRow(
                icon = Icons.Filled.PersonRemove,
                label = "Remove Friend",
                description = "Remove this contact from your friends list.",
                onClick = viewModel::removeFriend,
            )
            ManagementRow(
                icon = Icons.Filled.Block,
                label = "Block User",
                description = "Stop receiving messages and calls from this contact.",
                onClick = viewModel::blockUser,
                destructive = true,
            )
            ManagementRow(
                icon = Icons.Filled.Flag,
                label = "Report User",
                description = "Report this contact for review by our team.",
                onClick = { showReport = true },
                destructive = true,
            )
            Spacer(Modifier.height(GagaDimens.space24))
        }
    }
    selectedMedia?.let { message ->
        MediaViewerOverlay(message = message, onDismiss = { selectedMedia = null })
    }
}


/**
 * Private media must be signed before Coil can fetch it.
 * Videos without a thumbnail use a clear labeled preview instead of gray
 * empty rectangles; both types open the existing in-app media viewer.
 */
@Composable
private fun SharedMediaThumbnail(
    item: SharedMediaItem,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val preview = rememberSignedMediaUrl(if (item.isVideo) item.thumbnailUrl else item.url)
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClickLabel = if (item.isVideo) "Play shared video" else "View shared photo", onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (preview.isNullOrBlank()) {
            if (item.isVideo && item.thumbnailUrl.isNullOrBlank()) {
                Icon(Icons.Filled.Videocam, contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(32.dp))
                Text("Video", modifier = Modifier.align(Alignment.BottomCenter).padding(6.dp),
                    style = MaterialTheme.typography.labelMedium)
            } else {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
            }
        } else {
            SubcomposeAsyncImage(
                model = preview,
                contentDescription = if (item.isVideo) "Shared video preview" else "Shared photo",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
                loading = {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                    }
                },
                error = {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("Preview unavailable", style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
            )
        }
        if (item.isVideo) {
            Icon(
                Icons.Filled.PlayArrow,
                contentDescription = "Play video",
                tint = Color.White,
                modifier = Modifier.align(Alignment.Center)
                    .size(32.dp)
                    .background(Color.Black.copy(alpha = 0.45f), CircleShape),
            )
        }
    }
}

/**
 * A single management action: icon, title, an explanatory subtitle and an
 * optional destructive (error-coloured) treatment. The whole row is tappable.
 */
@Composable
private fun ManagementRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    description: String,
    onClick: () -> Unit,
    destructive: Boolean = false,
) {
    val tint = if (destructive) {
        MaterialTheme.colorScheme.error
    } else {
        MaterialTheme.colorScheme.onSurface
    }
    HorizontalDivider(
        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
        modifier = Modifier.padding(horizontal = GagaDimens.space16),
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space12),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = tint)
        Spacer(Modifier.width(GagaDimens.space16))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyLarge,
                color = tint,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun InfoAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(
            onClick = onClick,
            modifier = Modifier
                .size(52.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            Icon(icon, contentDescription = label, tint = MaterialTheme.colorScheme.primary)
        }
        Spacer(Modifier.height(GagaDimens.space4))
        Text(text = label, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun StatChip(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(GagaDimens.iconSmall),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.width(GagaDimens.space4))
        Text(text = label, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun EmptyRow(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
    )
}

private fun formatBytes(bytes: Long): String = when {
    bytes >= 1_048_576 -> "%.1f MB".format(bytes / 1_048_576.0)
    bytes >= 1_024 -> "%.0f KB".format(bytes / 1_024.0)
    else -> "$bytes B"
}
