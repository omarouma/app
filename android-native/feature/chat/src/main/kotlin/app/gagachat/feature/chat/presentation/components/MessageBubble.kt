package app.gagachat.feature.chat.presentation.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageStatus
import app.gagachat.core.model.MessageType
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen
import app.gagachat.core.ui.theme.GagaTheme
import app.gagachat.core.ui.theme.IncomingBubbleShape
import app.gagachat.core.ui.theme.OutgoingBubbleShape
import app.gagachat.core.ui.util.TimeFormat
import coil.compose.AsyncImage
import java.util.Locale
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.tan

/**
 * A single chat bubble. Renders every message type, an optional quoted reply, a
 * "Forwarded" marker, the reaction chips and the delivery/read tick. Long-press
 * opens the message action sheet (reply / react / edit / forward / delete).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun MessageBubble(
    message: Message,
    isOutgoing: Boolean,
    currentUserId: String,
    repliedMessage: Message?,
    onRetry: () -> Unit,
    onMediaClick: (Message) -> Unit,
    onLongPress: (Message) -> Unit,
    onReactionClick: (Message, String) -> Unit,
    onReplyClick: (Message) -> Unit,
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
        Column(horizontalAlignment = if (isOutgoing) Alignment.End else Alignment.Start) {
            Column(
                modifier = Modifier
                    .widthIn(max = 320.dp)
                    .clip(shape)
                    .background(bubbleColor)
                    .combinedClickable(
                        onClick = { if (message.type != MessageType.TEXT) onMediaClick(message) },
                        onLongClick = { onLongPress(message) },
                    )
                    .padding(horizontal = GagaDimens.space12, vertical = GagaDimens.space8),
            ) {
                if (message.forwardedFrom != null && !message.isDeleted) {
                    ForwardedLabel(contentColor = contentColor)
                }
                if (repliedMessage != null && !message.isDeleted) {
                    ReplyQuote(
                        replied = repliedMessage,
                        contentColor = contentColor,
                        onClick = { onReplyClick(repliedMessage) },
                    )
                    Spacer(Modifier.height(GagaDimens.space4))
                }
                if (message.isDeleted) {
                    Text(
                        text = "This message was deleted",
                        style = MaterialTheme.typography.bodyMedium,
                        color = contentColor.copy(alpha = 0.6f),
                        fontStyle = FontStyle.Italic,
                    )
                } else {
                    MessageContent(
                        message = message,
                        contentColor = contentColor,
                        onMediaClick = onMediaClick,
                    )
                }
                Spacer(Modifier.height(GagaDimens.space2))
                MessageMeta(
                    message = message,
                    isOutgoing = isOutgoing,
                    contentColor = contentColor,
                    onRetry = onRetry,
                    // Trailing-aligned but content-sized: the meta row must not
                    // stretch the bubble to its 320dp cap (F03). A short message
                    // now hugs its text instead of filling a wide bubble.
                    modifier = Modifier.align(Alignment.End),
                )
            }
            if (message.hasReactions) {
                Spacer(Modifier.height(GagaDimens.space2))
                ReactionsRow(
                    message = message,
                    currentUserId = currentUserId,
                    onClick = { emoji -> onReactionClick(message, emoji) },
                )
            }
        }
    }
}

@Composable
private fun ForwardedLabel(contentColor: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            Icons.Filled.Share,
            contentDescription = null,
            tint = contentColor.copy(alpha = 0.7f),
            modifier = Modifier.size(12.dp),
        )
        Spacer(Modifier.width(GagaDimens.space4))
        Text(
            text = "Forwarded",
            style = MaterialTheme.typography.labelSmall,
            color = contentColor.copy(alpha = 0.7f),
            fontStyle = FontStyle.Italic,
        )
    }
    Spacer(Modifier.height(GagaDimens.space2))
}

/** Compact quoted-reply strip shown inside a bubble that replies to another. */
@Composable
private fun ReplyQuote(
    replied: Message,
    contentColor: Color,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(contentColor.copy(alpha = 0.10f))
            .clickable(onClick = onClick)
            .padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space6),
    ) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .height(32.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(contentColor.copy(alpha = 0.6f)),
        )
        Spacer(Modifier.width(GagaDimens.space8))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = replied.senderName ?: "Reply",
                style = MaterialTheme.typography.labelSmall,
                color = contentColor.copy(alpha = 0.85f),
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = replied.previewText(),
                style = MaterialTheme.typography.bodySmall,
                color = contentColor.copy(alpha = 0.7f),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** Reaction chips (emoji + count). The current user's own reaction is highlighted. */
@Composable
private fun ReactionsRow(
    message: Message,
    currentUserId: String,
    onClick: (String) -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(GagaDimens.space4)) {
        message.reactions.forEach { (emoji, users) ->
            val mine = users.contains(currentUserId)
            Surface(
                shape = RoundedCornerShape(50),
                color = if (mine) {
                    MaterialTheme.colorScheme.primaryContainer
                } else {
                    MaterialTheme.colorScheme.surfaceVariant
                },
                modifier = Modifier.clickable { onClick(emoji) },
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space2),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(text = emoji, style = MaterialTheme.typography.labelMedium)
                    if (users.size > 1) {
                        Spacer(Modifier.width(GagaDimens.space4))
                        Text(
                            text = users.size.toString(),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageContent(
    message: Message,
    contentColor: Color,
    onMediaClick: (Message) -> Unit,
) {
    when (message.type) {
        MessageType.TEXT -> Text(
            text = message.text.orEmpty(),
            style = MaterialTheme.typography.bodyLarge,
            color = contentColor,
        )
        MessageType.IMAGE -> if (message.isMultiImage) {
            MultiImageGrid(message = message, onClick = { onMediaClick(message) })
        } else {
            MediaImage(
                message = message,
                contentColor = contentColor,
                onClick = { onMediaClick(message) },
            )
        }
        MessageType.VIDEO -> MediaVideo(
            message = message,
            contentColor = contentColor,
            onClick = { onMediaClick(message) },
        )
        MessageType.AUDIO -> AudioContent(message = message, contentColor = contentColor)
        MessageType.FILE -> FileContent(message = message, contentColor = contentColor)
        MessageType.LOCATION -> LocationContent(message = message, contentColor = contentColor)
        MessageType.CONTACT -> ContactContent(message = message, contentColor = contentColor)
        MessageType.CALL_EVENT -> Text(
            text = message.text.orEmpty(),
            style = MaterialTheme.typography.bodyMedium,
            color = contentColor.copy(alpha = 0.85f),
        )
    }
}

@Composable
private fun MediaImage(message: Message, contentColor: Color, onClick: () -> Unit) {
    val signed = rememberSignedMediaUrl(message.mediaUrl)
    val model = message.localMediaPath ?: signed
    Box(
        modifier = Modifier
            .size(width = 220.dp, height = 160.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(enabled = model != null, onClick = onClick),
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
        UploadStatusOverlay(message)
    }
}

/**
 * Distinguishes the media upload lifecycle inside a bubble (F04): preparing,
 * uploading with a percentage, and failed. A bare percentage with a pending
 * clock gave the user no explanation or recovery affordance.
 */
@Composable
private fun UploadStatusOverlay(message: Message) {
    // Only meaningful while the media has not been committed to the server.
    if (message.mediaUrl != null || (!message.isPending && !message.isFailed)) return
    val progress = message.uploadProgress
    val label = when {
        message.isFailed -> "Failed \u2014 tap to retry"
        progress == null || progress <= 0 -> "Preparing\u2026"
        progress < 100 -> "$progress%"
        else -> "Finishing\u2026"
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.38f)),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (!message.isFailed) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = Color.White,
                )
                Spacer(Modifier.width(6.dp))
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = Color.White,
            )
        }
    }
}

/**
 * 2-up grid for multi-photo messages. Shows up to four tiles with a "+N"
 * overlay when the message carries more than four images.
 */
@Composable
private fun MultiImageGrid(message: Message, onClick: () -> Unit) {
    val urls = message.allMediaUrls
    val signedUrls = rememberSignedMediaUrls(urls)
    val shown = signedUrls.take(4)
    Column(
        modifier = Modifier
            .width(220.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        shown.chunked(2).forEachIndexed { rowIndex, rowItems ->
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                rowItems.forEachIndexed { colIndex, url ->
                    val globalIndex = rowIndex * 2 + colIndex
                    Box(
                        modifier = Modifier
                            .size(width = 109.dp, height = 109.dp)
                            .background(MaterialTheme.colorScheme.surfaceVariant),
                        contentAlignment = Alignment.Center,
                    ) {
                        AsyncImage(
                            model = url,
                            contentDescription = "Photo",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                        if (urls.size > 4 && globalIndex == 3) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(109.dp)
                                    .background(Color.Black.copy(alpha = 0.45f)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = "+${urls.size - 4}",
                                    style = MaterialTheme.typography.titleLarge,
                                    color = Color.White,
                                )
                            }
                        }
                    }
                }
                // Pad an odd final row so tiles stay square.
                if (rowItems.size == 1) {
                    Spacer(Modifier.size(width = 109.dp, height = 109.dp))
                }
            }
        }
    }
}

@Composable
private fun MediaVideo(message: Message, contentColor: Color, onClick: () -> Unit) {
    val signedThumb = rememberSignedMediaUrl(message.thumbnailUrl)
    Box(
        modifier = Modifier
            .size(width = 220.dp, height = 160.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        val thumb = signedThumb ?: message.localMediaPath
        if (thumb != null) {
            AsyncImage(
                model = thumb,
                contentDescription = "Video",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.45f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.PlayArrow,
                contentDescription = "Play video",
                tint = Color.White,
                modifier = Modifier.size(40.dp),
            )
        }
    }
}

@Composable
private fun AudioContent(message: Message, contentColor: Color) {
    val player = rememberVoicePlayer()
    val signed = rememberSignedMediaUrl(message.mediaUrl)
    val source = signed ?: message.localMediaPath
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
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(contentColor.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Share, contentDescription = null, tint = contentColor)
        }
        Spacer(Modifier.width(GagaDimens.space8))
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
}

@Composable
private fun LocationContent(message: Message, contentColor: Color) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val clipboard = LocalClipboardManager.current
    val lat = message.latitude
    val lng = message.longitude
    val hasCoords = lat != null && lng != null
    val coordsText = if (hasCoords) {
        String.format(Locale.US, "%.5f, %.5f", lat, lng)
    } else {
        "Location"
    }
    val openMap = {
        if (hasCoords) {
            val label = Uri.encode("Shared location")
            val uri = Uri.parse("geo:$lat,$lng?q=$lat,$lng($label)")
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            runCatching { context.startActivity(intent) }
        }
        Unit
    }
    val copyCoords = {
        if (hasCoords) clipboard.setText(AnnotatedString(coordsText))
        Unit
    }
    val tileUrl = if (hasCoords) osmTileUrl(lat!!, lng!!, 16) else null

    Box(
        modifier = Modifier
            .size(width = 240.dp, height = 190.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFFE7EDE3))
            .clickable(enabled = hasCoords, onClick = openMap),
    ) {
        // Stylised map base so the card always reads as a map, even offline.
        StylisedMap(modifier = Modifier.fillMaxSize())
        if (tileUrl != null) {
            AsyncImage(
                model = tileUrl,
                contentDescription = "Map",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
        // Red pin centred on the shared point.
        Icon(
            Icons.Filled.LocationOn,
            contentDescription = null,
            tint = Color(0xFFE53935),
            modifier = Modifier
                .align(Alignment.Center)
                .size(40.dp),
        )
        // Green banner: title, coordinates and copy / navigate actions.
        Row(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .padding(GagaDimens.space8)
                .clip(RoundedCornerShape(10.dp))
                .background(GagaGreen)
                .padding(
                    start = GagaDimens.space12,
                    end = GagaDimens.space4,
                    top = GagaDimens.space6,
                    bottom = GagaDimens.space6,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Shared Location",
                    color = Color.White,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = coordsText,
                    color = Color.White.copy(alpha = 0.9f),
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            IconButton(onClick = copyCoords) {
                Icon(
                    Icons.Filled.ContentCopy,
                    contentDescription = "Copy coordinates",
                    tint = Color.White,
                    modifier = Modifier.size(18.dp),
                )
            }
            IconButton(onClick = openMap) {
                Icon(
                    Icons.Filled.NearMe,
                    contentDescription = "Navigate",
                    tint = Color.White,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

/**
 * A lightweight, dependency-free map sketch (water, blocks and streets) drawn
 * with a Canvas. It sits beneath the live tile so the location card is never
 * blank when the tile service is unreachable.
 */
@Composable
private fun StylisedMap(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        drawRect(color = Color(0xFFEDE7DC))
        // Waterway across the top-left corner.
        drawRect(
            color = Color(0xFFA9CCE3),
            topLeft = Offset(0f, h * 0.10f),
            size = androidx.compose.ui.geometry.Size(w * 0.55f, h * 0.12f),
        )
        // Green park block.
        drawRect(
            color = Color(0xFFCDE6C5),
            topLeft = Offset(w * 0.62f, h * 0.08f),
            size = androidx.compose.ui.geometry.Size(w * 0.34f, h * 0.22f),
        )
        // Street grid.
        val street = Color.White
        for (i in 1..4) {
            val y = h * i / 5f
            drawRect(color = street, topLeft = Offset(0f, y), size = androidx.compose.ui.geometry.Size(w, 4f))
        }
        for (i in 1..5) {
            val x = w * i / 6f
            drawRect(color = street, topLeft = Offset(x, 0f), size = androidx.compose.ui.geometry.Size(4f, h))
        }
    }
}

/** Builds an OpenStreetMap raster tile URL centred on the given coordinates. */
private fun osmTileUrl(lat: Double, lng: Double, zoom: Int): String {
    val n = 2.0.pow(zoom)
    val x = ((lng + 180.0) / 360.0 * n).toInt()
    val latRad = Math.toRadians(lat)
    val y = ((1.0 - ln(tan(latRad) + 1.0 / cos(latRad)) / PI) / 2.0 * n).toInt()
    return "https://tile.openstreetmap.org/$zoom/$x/$y.png"
}

/** Contact-card bubble: avatar glyph, name and tappable phone number. */
@Composable
private fun ContactContent(message: Message, contentColor: Color) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val phone = message.contactPhone
    val dial = {
        if (!phone.isNullOrBlank()) {
            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(phone)}")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            runCatching { context.startActivity(intent) }
        }
        Unit
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(enabled = !phone.isNullOrBlank(), onClick = dial)
            .padding(vertical = GagaDimens.space2, horizontal = GagaDimens.space2),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(contentColor.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Person, contentDescription = null, tint = contentColor)
        }
        Spacer(Modifier.width(GagaDimens.space8))
        Column {
            Text(
                text = message.contactName ?: "Contact",
                style = MaterialTheme.typography.bodyMedium,
                color = contentColor,
                fontWeight = FontWeight.SemiBold,
            )
            if (!phone.isNullOrBlank()) {
                Text(
                    text = phone,
                    style = MaterialTheme.typography.labelSmall,
                    color = contentColor.copy(alpha = 0.7f),
                )
            }
        }
    }
}

@Composable
private fun MessageMeta(
    message: Message,
    isOutgoing: Boolean,
    contentColor: Color,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (message.editedAt != null && !message.isDeleted) {
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

/** Short, human-readable preview of a message used in reply quotes. */
internal fun Message.previewText(): String = when (type) {
    MessageType.TEXT -> text.orEmpty()
    MessageType.IMAGE -> "\uD83D\uDCF7 Photo"
    MessageType.VIDEO -> "\uD83C\uDFA5 Video"
    MessageType.AUDIO -> "\uD83C\uDFA4 Voice message"
    MessageType.FILE -> text ?: "\uD83D\uDCCE Attachment"
    MessageType.LOCATION -> "\uD83D\uDCCD Location"
    MessageType.CONTACT -> "\uD83D\uDC64 ${contactName ?: "Contact"}"
    MessageType.CALL_EVENT -> text ?: "Call"
}

private fun formatBytes(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> "${bytes / 1024} KB"
    else -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
}
