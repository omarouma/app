package app.gagachat.feature.chat.presentation.components

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.gagachat.core.ui.theme.GagaDimens
import coil.compose.AsyncImage

/**
 * F10: review step shown after the user picks photos. Lets them reorder the
 * selection, drop any they don't want, and attach a caption before sending.
 * The ordered result is handed back so it can be sent as one album (F13).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MediaReviewSheet(
    uris: List<Uri>,
    onDismiss: () -> Unit,
    onSend: (List<Uri>, String) -> Unit,
) {
    var ordered by remember(uris) { mutableStateOf(uris) }
    var caption by remember { mutableStateOf("") }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space20),
        ) {
            Text(
                text = "Review photos",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.size(GagaDimens.space4))
            Text(
                text = "${ordered.size} selected \u00b7 use the arrows to reorder",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.size(GagaDimens.space12))
            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 340.dp),
                horizontalArrangement = Arrangement.spacedBy(GagaDimens.space8),
                verticalArrangement = Arrangement.spacedBy(GagaDimens.space8),
            ) {
                itemsIndexed(ordered, key = { _, uri -> uri.toString() }) { index, uri ->
                    ReviewTile(
                        uri = uri,
                        position = index + 1,
                        canMoveEarlier = index > 0,
                        canMoveLater = index < ordered.lastIndex,
                        onMoveEarlier = {
                            ordered = ordered.toMutableList().apply { add(index - 1, removeAt(index)) }
                        },
                        onMoveLater = {
                            ordered = ordered.toMutableList().apply { add(index + 1, removeAt(index)) }
                        },
                        onRemove = {
                            ordered = ordered.toMutableList().apply { removeAt(index) }
                        },
                    )
                }
            }
            Spacer(Modifier.size(GagaDimens.space12))
            OutlinedTextField(
                value = caption,
                onValueChange = { caption = it },
                placeholder = { Text("Add a caption\u2026") },
                modifier = Modifier.fillMaxWidth(),
                maxLines = 3,
            )
            Spacer(Modifier.size(GagaDimens.space12))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDismiss) { Text("Cancel") }
                Spacer(Modifier.size(GagaDimens.space8))
                Button(
                    onClick = { onSend(ordered, caption) },
                    enabled = ordered.isNotEmpty(),
                ) { Text("Send") }
            }
            Spacer(Modifier.size(GagaDimens.space12))
        }
    }
}

@Composable
private fun ReviewTile(
    uri: Uri,
    position: Int,
    canMoveEarlier: Boolean,
    canMoveLater: Boolean,
    onMoveEarlier: () -> Unit,
    onMoveLater: () -> Unit,
    onRemove: () -> Unit,
) {
    Box(
        modifier = Modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        AsyncImage(
            model = uri,
            contentDescription = "Selected photo $position",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().aspectRatio(1f),
        )
        Surface(
            shape = CircleShape,
            color = MaterialTheme.colorScheme.scrim.copy(alpha = 0.6f),
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(4.dp)
                .size(22.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    text = position.toString(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            }
        }
        IconButton(
            onClick = onRemove,
            modifier = Modifier.align(Alignment.TopEnd).size(28.dp),
        ) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.scrim.copy(alpha = 0.6f),
                modifier = Modifier.size(22.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        Icons.Filled.Close,
                        contentDescription = "Remove photo $position",
                        tint = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
        }
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
        ) {
            IconButton(onClick = onMoveEarlier, enabled = canMoveEarlier, modifier = Modifier.size(30.dp)) {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.scrim.copy(alpha = 0.6f),
                    modifier = Modifier.size(24.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                            contentDescription = "Move earlier",
                            tint = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
            IconButton(onClick = onMoveLater, enabled = canMoveLater, modifier = Modifier.size(30.dp)) {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.scrim.copy(alpha = 0.6f),
                    modifier = Modifier.size(24.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.AutoMirrored.Filled.KeyboardArrowRight,
                            contentDescription = "Move later",
                            tint = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }
    }
}
