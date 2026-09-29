package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Audiotrack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.gagachat.core.model.Message
import app.gagachat.core.ui.theme.GagaDimens
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import app.gagachat.core.ui.util.TimeFormat

/**
 * The message composer. Shows a reply quote or an edit banner above the field
 * when active, an attachment bottom sheet for media/location/contact, and swaps
 * the field for a recording strip while a voice clip is being captured.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessageComposer(
    draft: String,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    replyTo: Message?,
    onCancelReply: () -> Unit,
    editingMessage: Message?,
    onCancelEdit: () -> Unit,
    onAttach: () -> Unit,
    onPickImage: () -> Unit,
    onTakePhoto: () -> Unit,
    onPickVideo: () -> Unit,
    onPickAudio: () -> Unit,
    onShareLocation: () -> Unit,
    onPickContact: () -> Unit,
    isRecording: Boolean,
    recordingElapsedMs: Long,
    onStartRecording: () -> Unit,
    onStopRecording: () -> Unit,
    onCancelRecording: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var showAttachSheet by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState()
    val haptics = LocalHapticFeedback.current

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
            if (editingMessage != null && !isRecording) {
                EditBanner(message = editingMessage, onCancel = onCancelEdit)
            } else if (replyTo != null && !isRecording) {
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
                    IconButton(onClick = { showAttachSheet = true }) {
                        Icon(Icons.Filled.AttachFile, contentDescription = "Attach")
                    }
                    TextField(
                        value = draft,
                        onValueChange = onDraftChange,
                        modifier = Modifier.weight(1f),
                        placeholder = { Text(if (editingMessage != null) "Edit message" else "Message") },
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
                    if (draft.isBlank() && editingMessage == null) {
                        IconButton(onClick = onStartRecording) {
                            Icon(Icons.Filled.Mic, contentDescription = "Record voice message")
                        }
                    } else {
                        FilledIconButton(
                            onClick = {
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                onSend()
                            },
                            shape = CircleShape,
                            modifier = Modifier.size(48.dp),
                        ) {
                            if (editingMessage != null) {
                                Icon(Icons.Filled.Edit, contentDescription = "Save edit")
                            } else {
                                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAttachSheet) {
        ModalBottomSheet(
            onDismissRequest = { showAttachSheet = false },
            sheetState = sheetState,
        ) {
            AttachmentSheet(
                onPickImage = { showAttachSheet = false; onPickImage() },
                onTakePhoto = { showAttachSheet = false; onTakePhoto() },
                onPickVideo = { showAttachSheet = false; onPickVideo() },
                onPickAudio = { showAttachSheet = false; onPickAudio() },
                onPickFile = { showAttachSheet = false; onAttach() },
                onShareLocation = { showAttachSheet = false; onShareLocation() },
                onPickContact = { showAttachSheet = false; onPickContact() },
            )
        }
    }
}

/** Grid of attachment options shown in the bottom sheet. */
@Composable
private fun AttachmentSheet(
    onPickImage: () -> Unit,
    onTakePhoto: () -> Unit,
    onPickVideo: () -> Unit,
    onPickAudio: () -> Unit,
    onPickFile: () -> Unit,
    onShareLocation: () -> Unit,
    onPickContact: () -> Unit,
) {
    Column(modifier = Modifier.padding(bottom = GagaDimens.space24)) {
        Text(
            text = "Share",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space16),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            AttachOption(Icons.Filled.Image, "Photos", onPickImage)
            AttachOption(Icons.Filled.CameraAlt, "Camera", onTakePhoto)
            AttachOption(Icons.Filled.Videocam, "Video", onPickVideo)
            AttachOption(Icons.Filled.Audiotrack, "Audio", onPickAudio)
        }
        Spacer(Modifier.size(GagaDimens.space12))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space16),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            AttachOption(Icons.Filled.Description, "Document", onPickFile)
            AttachOption(Icons.Filled.LocationOn, "Location", onShareLocation)
            AttachOption(Icons.Filled.Person, "Contact", onPickContact)
            Spacer(Modifier.width(60.dp))
        }
    }
}

@Composable
private fun AttachOption(icon: ImageVector, label: String, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clip(MaterialTheme.shapes.medium)
            .clickable(onClick = onClick)
            .padding(GagaDimens.space4),
    ) {
        Box(
            modifier = Modifier
                .size(46.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = label, tint = MaterialTheme.colorScheme.onPrimaryContainer)
        }
        Spacer(Modifier.size(GagaDimens.space4))
        Text(text = label, style = MaterialTheme.typography.labelSmall)
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
                text = message.previewText(),
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

@Composable
private fun EditBanner(message: Message, onCancel: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space12, vertical = GagaDimens.space6),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Editing message",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = message.text.orEmpty(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IconButton(onClick = onCancel) {
            Icon(Icons.Filled.Close, contentDescription = "Cancel edit")
        }
    }
}
