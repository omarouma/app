package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageStatus
import app.gagachat.core.model.MessageType
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaTheme
import app.gagachat.core.ui.theme.IncomingBubbleShape
import app.gagachat.core.ui.theme.OutgoingBubbleShape
import app.gagachat.core.ui.util.TimeFormat
import coil.compose.AsyncImage

@Composable
fun MessageBubble(
    message: Message,
    isOutgoing: Boolean,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val bubbleColor = if (isOutgoing) {
        GagaTheme.extraColors.outgoingBubble
    } else {
        GagaTheme.extraColors.incomingBubble
    }
    val contentColor = if (isOutgoing) {
        GagaTheme.extraColors.onOutgoingBubble
    } else {
        GagaTheme.extraColors.onIncomingBubble
    }
    val shape = if (isOutgoing) OutgoingBubbleShape else IncomingBubbleShape

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space12, vertical = GagaDimens.space2),
        horizontalArrangement = if (isOutgoing) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 320.dp)
                .clip(shape)
                .background(bubbleColor)
                .padding(horizontal = GagaDimens.space12, vertical = GagaDimens.space8),
        ) {
            if (message.isDeleted) {
                Text(
                    text = "This message was deleted",
                    style = MaterialTheme.typography.bodyMedium,
                    color = contentColor.copy(alpha = 0.6f),
                )
            } else {
                MessageContent(message = message, contentColor = contentColor)
            }
            Spacer(Modifier.height(GagaDimens.space2))
            MessageMeta(
                message = message,
                isOutgoing = isOutgoing,
                contentColor = contentColor,
                onRetry = onRetry,
            )
        }
    }
}

@Composable
private fun MessageContent(message: Message, contentColor: Color) {
    when (message.type) {
        MessageType.TEXT -> Text(
            text = message.text.orEmpty(),
            style = MaterialTheme.typography.bodyLarge,
            color = contentColor,
        )
        MessageType.IMAGE -> MediaImage(message = message, contentColor = contentColor)
        MessageType.VIDEO -> MediaVideo(message = message, contentColor = contentColor)
        MessageType.AUDIO -> AudioContent(message = message, contentColor = contentColor)
        MessageType.FILE -> FileContent(message = message, contentColor = contentColor)
        MessageType.LOCATION -> LocationContent(message = message, contentColor = contentColor)
        MessageType.CALL_EVENT -> Text(
            text = message.text.orEmpty(),
            style = MaterialTheme.typography.bodyMedium,
            color = contentColor.copy(alpha = 0.85f),
        )
    }
}

@Composable
private fun MediaImage(message: Message, contentColor: Color) {
    val model = message.localMediaPath ?: message.mediaUrl
    Box(
        modifier = Modifier
            .size(width = 220.dp, height = 160.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        if (model != null) {
            AsyncImage(
                model = model,
                contentDescription = "Photo",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        message.uploadProgress?.let { progress ->
            if (progress in 0..99) {
                Text(
                    text = "$progress%",
                    style = MaterialTheme.typography.labelLarge,
                    color = Color.White,
                )
            }
        }
    }
}

@Composable
private fun MediaVideo(message: Message, contentColor: Color) {
    Box(
        modifier = Modifier
            .size(width = 220.dp, height = 160.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        val thumb = message.thumbnailUrl ?: message.localMediaPath
        if (thumb != null) {
            AsyncImage(
                model = thumb,
                contentDescription = "Video",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Icon(
            Icons.Filled.PlayArrow,
            contentDescription = "Play video",
            tint = Color.White,
            modifier = Modifier.size(48.dp),
        )
    }
}

@Composable
private fun AudioContent(message: Message, contentColor: Color) {
    val player = rememberVoicePlayer()
    val source = message.mediaUrl ?: message.localMediaPath
    val playable = !source.isNullOrBlank()
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(enabled = playable) { player.toggle(source) }
            .padding(vertical = GagaDimens.space2, horizontal = GagaDimens.space2),
    ) {
        Icon(
            imageVector = if (player.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
            contentDescription = if (player.isPlaying) "Pause audio" else "Play audio",
            tint = contentColor,
        )
        Spacer(Modifier.width(GagaDimens.space8))
        Text(
            text = message.mediaDurationMs?.let { TimeFormat.callDuration(it) } ?: "Voice message",
            style = MaterialTheme.typography.bodyMedium,
            color = contentColor,
        )
    }
}

@Composable
private fun FileContent(message: Message, contentColor: Color) {
    Column {
        Text(
            text = message.text ?: "Attachment",
            style = MaterialTheme.typography.bodyMedium,
            color = contentColor,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        message.mediaSize?.let {
            Text(
                text = formatBytes(it),
                style = MaterialTheme.typography.labelSmall,
                color = contentColor.copy(alpha = 0.7f),
            )
        }
    }
}

@Composable
private fun LocationContent(message: Message, contentColor: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.LocationOn, contentDescription = "Location", tint = contentColor)
        Spacer(Modifier.width(GagaDimens.space8))
        Text(
            text = "Shared location",
            style = MaterialTheme.typography.bodyMedium,
            color = contentColor,
        )
    }
}

@Composable
private fun MessageMeta(
    message: Message,
    isOutgoing: Boolean,
    contentColor: Color,
    onRetry: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (message.editedAt != null) {
            Text(
                text = "edited",
                style = MaterialTheme.typography.labelSmall,
                color = contentColor.copy(alpha = 0.6f),
            )
            Spacer(Modifier.width(GagaDimens.space4))
        }
        Text(
            text = TimeFormat.messageTime(message.sortTimestamp),
            style = MaterialTheme.typography.labelSmall,
            color = contentColor.copy(alpha = 0.6f),
        )
        if (isOutgoing) {
            Spacer(Modifier.width(GagaDimens.space4))
            StatusTick(status = message.status, onRetry = onRetry)
        }
    }
}

@Composable
private fun StatusTick(status: MessageStatus, onRetry: () -> Unit) {
    when (status) {
        MessageStatus.PENDING -> Icon(
            Icons.Filled.Schedule,
            contentDescription = "Sending",
            modifier = Modifier.size(14.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        MessageStatus.SENT -> Icon(
            Icons.Filled.Check,
            contentDescription = "Sent",
            modifier = Modifier.size(14.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        MessageStatus.DELIVERED -> Icon(
            Icons.Filled.DoneAll,
            contentDescription = "Delivered",
            modifier = Modifier.size(14.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        MessageStatus.READ -> Icon(
            Icons.Filled.DoneAll,
            contentDescription = "Read",
            modifier = Modifier.size(14.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
        MessageStatus.FAILED -> Icon(
            Icons.Filled.ErrorOutline,
            contentDescription = "Failed, tap to retry",
            modifier = Modifier
                .size(16.dp)
                .clickable(onClick = onRetry),
            tint = MaterialTheme.colorScheme.error,
        )
    }
}

private fun formatBytes(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> "${bytes / 1024} KB"
    else -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
}
