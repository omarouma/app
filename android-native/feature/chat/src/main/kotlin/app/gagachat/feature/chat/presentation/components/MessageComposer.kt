package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.gagachat.core.model.Message
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.util.TimeFormat

@Composable
fun MessageComposer(
    draft: String,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    replyTo: Message?,
    onCancelReply: () -> Unit,
    onAttach: () -> Unit,
    onPickImage: () -> Unit,
    onShareLocation: () -> Unit,
    isRecording: Boolean,
    recordingElapsedMs: Long,
    onStartRecording: () -> Unit,
    onStopRecording: () -> Unit,
    onCancelRecording: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding(),
        ) {
            if (replyTo != null && !isRecording) {
                ReplyPreview(message = replyTo, onCancel = onCancelReply)
            }
            if (isRecording) {
                RecordingBar(
                    elapsedMs = recordingElapsedMs,
                    onCancel = onCancelRecording,
                    onSend = onStopRecording,
                )
            } else {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space6),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    IconButton(onClick = onAttach) {
                        Icon(Icons.Filled.AttachFile, contentDescription = "Attach file")
                    }
                    IconButton(onClick = onPickImage) {
                        Icon(Icons.Filled.Image, contentDescription = "Send photo")
                    }
                    TextField(
                        value = draft,
                        onValueChange = onDraftChange,
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("Message") },
                        maxLines = 5,
                        shape = MaterialTheme.shapes.extraLarge,
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent,
                        ),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
                    )
                    Spacer(Modifier.width(GagaDimens.space4))
                    if (draft.isBlank()) {
                        IconButton(onClick = onShareLocation) {
                            Icon(Icons.Filled.LocationOn, contentDescription = "Share location")
                        }
                        IconButton(onClick = onStartRecording) {
                            Icon(Icons.Filled.Mic, contentDescription = "Record voice message")
                        }
                    } else {
                        FilledIconButton(
                            onClick = onSend,
                            shape = CircleShape,
                            modifier = Modifier.size(48.dp),
                        ) {
                            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
                        }
                    }
                }
            }
        }
    }
}

/**
 * Active-recording strip: a pulsing red dot, the elapsed timer and cancel/send
 * actions. Replaces the text field while the mic is live.
 */
@Composable
private fun RecordingBar(
    elapsedMs: Long,
    onCancel: () -> Unit,
    onSend: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space6),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onCancel) {
            Icon(Icons.Filled.Close, contentDescription = "Cancel recording")
        }
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.error),
        )
        Spacer(Modifier.width(GagaDimens.space8))
        Text(
            text = "Recording \u2022 ${TimeFormat.callDuration(elapsedMs)}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        FilledIconButton(
            onClick = onSend,
            shape = CircleShape,
            modifier = Modifier.size(48.dp),
        ) {
            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send voice message")
        }
    }
}

@Composable
private fun ReplyPreview(message: Message, onCancel: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space12, vertical = GagaDimens.space6),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Replying to ${message.senderName ?: "message"}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = message.text ?: "Attachment",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IconButton(onClick = onCancel) {
            Icon(Icons.Filled.Close, contentDescription = "Cancel reply")
        }
    }
}
