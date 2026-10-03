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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.gagachat.core.ui.theme.GagaDimens
import coil.compose.AsyncImage

/**
 * Review step for a single video attachment: shows a poster frame (Coil renders
 * the first frame via its VideoFrameDecoder), a play affordance and an optional
 * caption before the clip is queued for upload. Previously a picked video was
 * sent immediately with no preview or caption, which made a slow large upload
 * feel like a failure.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoReviewSheet(
    uri: Uri,
    onDismiss: () -> Unit,
    onSend: (String) -> Unit,
) {
    var caption by remember { mutableStateOf("") }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space20),
        ) {
            Text(
                text = "Send video",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.size(GagaDimens.space12))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                AsyncImage(
                    model = uri,
                    contentDescription = "Video preview",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
                )
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.45f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Filled.PlayArrow,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(40.dp),
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
                Button(onClick = { onSend(caption) }) { Text("Send") }
            }
            Spacer(Modifier.size(GagaDimens.space12))
        }
    }
}
