package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.BookmarkAdd
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.LocationSearching
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

private data class MediaAction(
    val title: String,
    val icon: ImageVector,
    val onClick: () -> Unit,
)

/**
 * Compact, responsive media actions shared by image and video viewers.
 * 3 columns when there is room; 2 columns on narrow screens or large type.
 * Keep callbacks unchanged: redesigning the sheet must not break media actions.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MediaActionsSheet(
    isImage: Boolean,
    onDismiss: () -> Unit,
    onSave: () -> Unit,
    onShare: () -> Unit,
    onOpen: () -> Unit,
    onExtract: () -> Unit,
    onForward: (() -> Unit)?,
    onFavorite: (() -> Unit)?,
    onEdit: (() -> Unit)?,
    onLocate: (() -> Unit)?,
    onAllMedia: (() -> Unit)?,
) {
    val primaryActions = buildList {
        if (onForward != null) add(MediaAction("Send to chat", Icons.AutoMirrored.Filled.Send, onForward))
        if (onFavorite != null) add(MediaAction("Favorite", Icons.Filled.BookmarkAdd, onFavorite))
        add(MediaAction("Open with…", Icons.Filled.OpenInNew, onOpen))
        add(MediaAction(if (isImage) "Save image" else "Save video", Icons.Filled.Download, onSave))
        add(MediaAction("Share…", Icons.Filled.Share, onShare))
        if (isImage && onEdit != null) add(MediaAction("Edit copy", Icons.Filled.Edit, onEdit))
    }
    val navigationActions = buildList {
        if (onLocate != null) add(MediaAction("Locate in chat", Icons.Filled.LocationSearching, onLocate))
        if (onAllMedia != null) add(MediaAction("Images and videos", Icons.Filled.PhotoLibrary, onAllMedia))
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.surface,
        dragHandle = { BottomSheetDefaults.DragHandle() },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .heightIn(max = 600.dp)
                .verticalScroll(rememberScrollState())
                .padding(start = 16.dp, end = 16.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Media actions",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(top = 4.dp, bottom = 2.dp),
            )
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                // A 360dp phone has ~328dp left after sheet padding, enough
                // for three 104dp tiles with 8dp gaps.
                val columns = if (maxWidth >= 328.dp && LocalDensity.current.fontScale <= 1.35f) 3 else 2
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    primaryActions.chunked(columns).forEach { group ->
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            group.forEach { action ->
                                MediaActionTile(action, Modifier.weight(1f))
                            }
                            repeat(columns - group.size) {
                                Spacer(Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
            if (navigationActions.isNotEmpty()) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    navigationActions.forEach { action ->
                        MediaActionTile(action, Modifier.weight(1f), horizontal = true)
                    }
                }
            }
            if (isImage) {
                MediaActionTile(
                    MediaAction("Extract / translate text", Icons.Filled.TextFields, onExtract),
                    Modifier.fillMaxWidth(),
                    horizontal = true,
                )
            }
            Button(
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp),
                shape = RoundedCornerShape(22.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            ) {
                Text("Cancel", style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

@Composable
private fun MediaActionTile(
    action: MediaAction,
    modifier: Modifier = Modifier,
    horizontal: Boolean = false,
) {
    Surface(
        onClick = action.onClick,
        modifier = modifier.heightIn(min = if (horizontal) 72.dp else 100.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f)),
        tonalElevation = 0.dp,
    ) {
        if (horizontal) {
            Row(
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MediaActionIcon(action.icon)
                Text(
                    action.title,
                    style = MaterialTheme.typography.labelMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }
        } else {
            Column(
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                MediaActionIcon(action.icon)
                Text(
                    action.title,
                    style = MaterialTheme.typography.labelMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun MediaActionIcon(icon: ImageVector) {
    Box(
        modifier = Modifier
            .size(42.dp)
            .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(14.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onPrimaryContainer,
            modifier = Modifier.size(23.dp),
        )
    }
}
