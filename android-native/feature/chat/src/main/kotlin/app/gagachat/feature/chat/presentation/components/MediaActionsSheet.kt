package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun MediaActionsSheet(isImage: Boolean, onDismiss: () -> Unit, onSave: () -> Unit,
    onShare: () -> Unit, onOpen: () -> Unit, onExtract: () -> Unit,
    onForward: (() -> Unit)?, onFavorite: (() -> Unit)?, onEdit: (() -> Unit)?,
    onLocate: (() -> Unit)?, onAllMedia: (() -> Unit)?) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().heightIn(max = 600.dp).verticalScroll(rememberScrollState()).padding(16.dp)) {
            Text("Media actions", style = MaterialTheme.typography.titleLarge)
            FlowRow(Modifier.fillMaxWidth(), maxItemsInEachRow = 3) {
                onForward?.let { ActionTile("Send to chat", Icons.AutoMirrored.Filled.Send, it) }
                onFavorite?.let { ActionTile("Favorite", Icons.Default.BookmarkAdd, it) }
                ActionTile("Open with…", Icons.Default.OpenInNew, onOpen)
                ActionTile(if (isImage) "Save image" else "Save video", Icons.Default.Download, onSave)
                ActionTile("Share…", Icons.Default.Share, onShare)
                if (isImage) onEdit?.let { ActionTile("Edit copy", Icons.Default.Edit, it) }
                onLocate?.let { ActionTile("Locate in chat", Icons.Default.LocationSearching, it) }
                onAllMedia?.let { ActionTile("Images and videos", Icons.Default.PhotoLibrary, it) }
                if (isImage) ActionTile("Extract / translate text", Icons.Default.TextFields, onExtract)
            }
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) { Text("Cancel") }
        }
    }
}

@Composable
private fun ActionTile(label: String, icon: ImageVector, onClick: () -> Unit) {
    FilledTonalButton(onClick = onClick, modifier = Modifier.widthIn(min = 100.dp, max = 180.dp).padding(4.dp).heightIn(min = 76.dp),
        contentPadding = PaddingValues(12.dp)) {
        Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
            Icon(icon, contentDescription = null)
            Text(label, style = MaterialTheme.typography.labelMedium)
        }
    }
}
