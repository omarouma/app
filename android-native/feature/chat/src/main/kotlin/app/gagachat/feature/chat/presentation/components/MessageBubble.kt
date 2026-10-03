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
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Poll
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.gagachat.core.common.util.LinkDetector
import app.gagachat.core.model.LinkPreview
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
import coil.compose.AsyncImagePainter
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
    onVotePoll: (Message, Int) -> Unit = { _, _ -> },
    onStopLiveLocation: (Message) -> Unit = {},
    linkPreview: LinkPreview? = null,
    onRequestLinkPreview: (String) -> Unit = {},
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
                        currentUserId = currentUserId,
                        onVotePoll = onVotePoll,
                        onStopLiveLocation = onStopLiveLocation,
                        linkPreview = linkPreview,
                        onRequestLinkPreview = onRequestLinkPreview,
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
    currentUserId: String,
    onVotePoll: (Message, Int) -> Unit,
    onStopLiveLocation: (Message) -> Unit,
    linkPreview: LinkPreview?,
    onRequestLinkPreview: (String) -> Unit,
) {
    if (message.isPoll) {
        PollContent(
            message = message,
            contentColor = contentColor,
            currentUserId = currentUserId,
            onVotePoll = onVotePoll,
        )
        return
    }
    if (message.isLiveLocation) {
        LiveLocationContent(
            message = message,
            contentColor = contentColor,
            onStopLiveLocation = onStopLiveLocation,
        )
        return
    }
    when (message.type) {
        MessageType.TEXT -> TextWithLinkPreview(
            message = message,
            contentColor = contentColor,
            linkPreview = linkPreview,
            onRequestLinkPreview = onRequestLinkPreview,
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
        MessageType.LOCATION -> LocationContent(message = message)
        MessageType.CONTACT -> ContactContent(message = message, contentColor = contentColor)
        MessageType.CALL_EVENT -> Text(
            text = message.text.orEmpty(),
            style = MaterialTheme.typography.bodyMedium,
            color = contentColor.copy(alpha = 0.85f),
        )
    }
}

/**
 * Text message body plus an optional rich link preview card (spec area 13).
 * The preview is requested lazily the first time the bubble composes; a card is
 * shown only once metadata has arrived, so the text never waits on the network.
 */
@Composable
private fun TextWithLinkPreview(
    message: Message,
    contentColor: Color,
    linkPreview: LinkPreview?,
    onRequestLinkPreview: (String) -> Unit,
) {
    val text = message.text.orEmpty()
    val url = remember(text) { LinkDetector.firstUrl(text) }
    LaunchedEffect(url) {
        if (url != null && linkPreview == null) onRequestLinkPreview(url)
    }
    Column {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyLarge,
            color = contentColor,
        )
        if (url != null && linkPreview != null && linkPreview.hasContent) {
            Spacer(Modifier.height(GagaDimens.space8))
            LinkPreviewCard(preview = linkPreview, contentColor = contentColor)
        }
    }
}

@Composable
private fun LinkPreviewCard(preview: LinkPreview, contentColor: Color) {
    val context = LocalContext.current
    val title = preview.title?.takeIf { it.isNotBlank() }
    val description = preview.description?.takeIf { it.isNotBlank() }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(contentColor.copy(alpha = 0.08f))
            .clickable {
                runCatching {
                    context.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse(preview.url))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    )
                }
            },
    ) {
        if (!preview.imageUrl.isNullOrBlank()) {
            AsyncImage(
                model = preview.imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(140.dp)
                    .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))
                    .background(contentColor.copy(alpha = 0.06f)),
            )
        }
        Column(modifier = Modifier.padding(GagaDimens.space8)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.Language,
                    contentDescription = null,
                    tint = contentColor.copy(alpha = 0.7f),
                    modifier = Modifier.size(12.dp),
                )
                Spacer(Modifier.width(GagaDimens.space4))
                Text(
                    text = preview.siteName?.takeIf { it.isNotBlank() } ?: preview.displayHost,
                    style = MaterialTheme.typography.labelSmall,
                    color = contentColor.copy(alpha = 0.7f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (title != null) {
                Spacer(Modifier.height(GagaDimens.space2))
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = contentColor,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (description != null) {
                Spacer(Modifier.height(GagaDimens.space2))
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = contentColor.copy(alpha = 0.8f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun MediaImage(message: Message, contentColor: Color, onClick: () -> Unit) {
    val signed = rememberSignedMediaUrl(message.mediaUrl)
    val model = rememberExistingLocalMedia(message.localMediaPath) ?: signed
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
    Box(
        modifier = Modifier
            .width(220.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick),
    ) {
        Column(
            modifier = Modifier.width(220.dp),
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
                            if (url != null) {
                                AsyncImage(
                                    model = url,
                                    contentDescription = "Photo",
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize(),
                                )
                            } else {
                                // Still being signed / uploaded — show a spinner
                                // rather than an empty grey tile.
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
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
        // Album upload lifecycle (preparing / % / failed) over the whole grid.
        UploadStatusOverlay(message)
    }
}

@Composable
private fun MediaVideo(message: Message, contentColor: Color, onClick: () -> Unit) {
    // Prefer a local frame (instant, offline), then the signed remote thumbnail,
    // then the local video file itself so a pending upload still shows a frame.
    val thumb = rememberExistingLocalMedia(message.thumbnailUrl)
        ?: rememberSignedMediaUrl(message.thumbnailUrl)
        ?: rememberExistingLocalMedia(message.localMediaPath)
    Box(
        modifier = Modifier
            .size(width = 220.dp, height = 160.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (thumb != null) {
            AsyncImage(
                model = thumb,
                contentDescription = "Video",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Icon(
                Icons.Filled.PlayArrow,
                contentDescription = null,
                tint = contentColor.copy(alpha = 0.4f),
                modifier = Modifier.size(48.dp),
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
        // Duration badge so the recipient knows the clip length up front.
        message.mediaDurationMs?.let { ms ->
            if (ms > 0) {
                Surface(
                    color = Color.Black.copy(alpha = 0.55f),
                    shape = RoundedCornerShape(6.dp),
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(6.dp),
                ) {
                    Text(
                        text = TimeFormat.callDuration(ms),
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
        }
        UploadStatusOverlay(message)
    }
}

@Composable
private fun AudioContent(message: Message, contentColor: Color) {
    val player = rememberVoicePlayer()
    val signed = rememberSignedMediaUrl(message.mediaUrl)
    val source = rememberExistingLocalMedia(message.localMediaPath) ?: signed
    val playable = !source.isNullOrBlank()
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(enabled = playable) { player.toggle(source) }
            .padding(vertical = GagaDimens.space2, horizontal = GagaDimens.space2),
    ) {
        // While a private-bucket voice note is being exchanged for a signed URL
        // the source is null; show a spinner instead of a dead play button so a
        // tap is never silently ignored.
        if (!playable) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp,
                color = contentColor,
            )
        } else {
            Icon(
                imageVector = if (player.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                contentDescription = if (player.isPlaying) "Pause audio" else "Play audio",
                tint = contentColor,
            )
        }
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
private fun LocationContent(message: Message) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val lat = message.latitude
    val lng = message.longitude
    val hasCoords = lat != null && lng != null
    val coordsText = if (hasCoords) {
        String.format(Locale.US, "%.5f, %.5f", lat, lng)
    } else {
        "Location"
    }
    // A place label may be supplied as the message text (e.g. a picked address);
    // fall back to a neutral title so the card is never blank.
    val placeLabel = message.text?.takeIf { it.isNotBlank() } ?: "Shared location"

    val openMap = {
        if (hasCoords) {
            val label = Uri.encode(placeLabel)
            val uri = Uri.parse("geo:$lat,$lng?q=$lat,$lng($label)")
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            runCatching { context.startActivity(intent) }
        }
        Unit
    }
    val directions = {
        if (hasCoords) {
            val uri = Uri.parse("google.navigation:q=$lat,$lng")
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            // Some devices have no navigation handler; fall back to the geo: view.
            if (runCatching { context.startActivity(intent) }.isFailure) openMap()
        }
        Unit
    }
    val copyCoords = {
        if (hasCoords) clipboard.setText(AnnotatedString(coordsText))
        Unit
    }

    // The basemap tile is fetched live; if it cannot be loaded we keep the
    // locally-drawn stylised map and label it, so a location message never shows
    // a broken or blocked tile image.
    var tileLoaded by remember(message.localId) { mutableStateOf(false) }
    var tileFailed by remember(message.localId) { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .width(240.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(124.dp)
                .clickable(enabled = hasCoords, onClick = openMap),
        ) {
            // Stylised map base so the card always reads as a map, even offline.
            StylisedMap(modifier = Modifier.fillMaxSize())
            if (hasCoords) {
                AsyncImage(
                    model = mapTileUrl(lat!!, lng!!, 16),
                    contentDescription = "Map preview",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                    onState = { state ->
                        when (state) {
                            is AsyncImagePainter.State.Success -> {
                                tileLoaded = true
                                tileFailed = false
                            }
                            is AsyncImagePainter.State.Error -> {
                                tileLoaded = false
                                tileFailed = true
                            }
                            else -> Unit
                        }
                    },
                )
            }
            // Red pin centred on the shared point.
            Icon(
                Icons.Filled.LocationOn,
                contentDescription = null,
                tint = Color(0xFFE53935),
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(34.dp),
            )
            when {
                hasCoords && tileFailed -> MapChip(
                    text = "Map preview unavailable",
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(GagaDimens.space6),
                )
                hasCoords && !tileLoaded -> MapChip(
                    text = "Loading map…",
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(GagaDimens.space6),
                )
                else -> MapChip(
                    text = "© Esri",
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(GagaDimens.space6),
                )
            }
        }
        // Compact info row: place label + coordinates + copy affordance.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space12, vertical = GagaDimens.space8),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.LocationOn,
                contentDescription = null,
                tint = GagaGreen,
                modifier = Modifier.size(GagaDimens.iconSmall),
            )
            Spacer(Modifier.width(GagaDimens.space8))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = placeLabel,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = coordsText,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            IconButton(onClick = copyCoords, modifier = Modifier.size(32.dp)) {
                Icon(
                    Icons.Filled.ContentCopy,
                    contentDescription = "Copy coordinates",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
        // Action row: open in a maps app, or start turn-by-turn directions.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    start = GagaDimens.space4,
                    end = GagaDimens.space4,
                    bottom = GagaDimens.space4,
                ),
        ) {
            TextButton(onClick = openMap, enabled = hasCoords, modifier = Modifier.weight(1f)) {
                Text("Open map")
            }
            TextButton(onClick = directions, enabled = hasCoords, modifier = Modifier.weight(1f)) {
                Text("Directions")
            }
        }
    }
}

/** Small translucent label chip used over the map thumbnail. */
@Composable
private fun MapChip(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        color = Color.White,
        style = MaterialTheme.typography.labelSmall,
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(Color.Black.copy(alpha = 0.45f))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
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

/**
 * Builds a raster basemap tile URL for the given coordinates.
 *
 * We deliberately do NOT use OpenStreetMap's `tile.openstreetmap.org` volunteer
 * servers: their tile usage policy forbids app traffic and they return a
 * "403 Access blocked" placeholder tile for in-app requests, which is exactly
 * the broken image that was appearing inside location messages. Instead we use
 * the Esri ArcGIS "World Street Map" basemap, which is available without an API
 * key and is intended for application use (attribution shown on the card).
 *
 * Note the Esri path order is `{z}/{y}/{x}` (y before x), unlike OSM's
 * `{z}/{x}/{y}`.
 */
private fun mapTileUrl(lat: Double, lng: Double, zoom: Int): String {
    val n = 2.0.pow(zoom)
    val maxIndex = n.toInt() - 1
    val x = ((lng + 180.0) / 360.0 * n).toInt().coerceIn(0, maxIndex)
    val latRad = Math.toRadians(lat)
    val y = ((1.0 - ln(tan(latRad) + 1.0 / cos(latRad)) / PI) / 2.0 * n)
        .toInt()
        .coerceIn(0, maxIndex)
    return "https://server.arcgisonline.com/ArcGIS/rest/services/" +
        "World_Street_Map/MapServer/tile/$zoom/$y/$x"
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
        if (message.isScheduled) {
            Text(
                text = "Scheduled",
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
        MessageStatus.SCHEDULED -> Icon(
            Icons.Filled.Schedule,
            contentDescription = "Scheduled",
            modifier = Modifier.size(14.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
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
internal fun Message.previewText(): String = when {
    isPoll -> "\uD83D\uDCCA Poll: ${pollQuestion.orEmpty()}"
    isLiveLocation -> "\uD83D\uDCCD Live location"
    else -> when (type) {
        MessageType.TEXT -> text.orEmpty()
        MessageType.IMAGE -> "\uD83D\uDCF7 Photo"
        MessageType.VIDEO -> "\uD83C\uDFA5 Video"
        MessageType.AUDIO -> "\uD83C\uDFA4 Voice message"
        MessageType.FILE -> text ?: "\uD83D\uDCCE Attachment"
        MessageType.LOCATION -> "\uD83D\uDCCD Location"
        MessageType.CONTACT -> "\uD83D\uDC64 ${contactName ?: "Contact"}"
        MessageType.CALL_EVENT -> text ?: "Call"
    }
}

private fun formatBytes(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> "${bytes / 1024} KB"
    else -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
}

/**
 * F25: a poll card. Renders the question, each option with a proportional vote
 * bar and count, and highlights the current user's single choice. Tapping an
 * option casts (or moves) the user's vote.
 */
@Composable
private fun PollContent(
    message: Message,
    contentColor: Color,
    currentUserId: String,
    onVotePoll: (Message, Int) -> Unit,
) {
    val votes = message.pollVotes
    val totalVotes = votes.values.sumOf { it.size }
    val mySelection = message.pollSelection(currentUserId)

    Column(
        modifier = Modifier
            .width(260.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(contentColor.copy(alpha = 0.08f))
            .padding(GagaDimens.space12),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Filled.Poll,
                contentDescription = null,
                tint = GagaGreen,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(GagaDimens.space6))
            Text(
                text = "Poll",
                style = MaterialTheme.typography.labelMedium,
                color = contentColor.copy(alpha = 0.7f),
                fontWeight = FontWeight.SemiBold,
            )
        }
        Spacer(Modifier.height(GagaDimens.space6))
        Text(
            text = message.pollQuestion.orEmpty(),
            style = MaterialTheme.typography.bodyLarge,
            color = contentColor,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(GagaDimens.space8))
        message.pollOptions.forEachIndexed { index, label ->
            val count = votes[index]?.size ?: 0
            val fraction = if (totalVotes == 0) 0f else count.toFloat() / totalVotes.toFloat()
            val mine = mySelection == index
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = GagaDimens.space2)
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { onVotePoll(message, index) }
                    .padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space6),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(
                        selected = mine,
                        onClick = { onVotePoll(message, index) },
                        modifier = Modifier.size(22.dp),
                    )
                    Spacer(Modifier.width(GagaDimens.space6))
                    Text(
                        text = label,
                        style = MaterialTheme.typography.bodyMedium,
                        color = contentColor,
                        fontWeight = if (mine) FontWeight.SemiBold else FontWeight.Normal,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = count.toString(),
                        style = MaterialTheme.typography.labelMedium,
                        color = contentColor.copy(alpha = 0.7f),
                    )
                }
                Spacer(Modifier.height(GagaDimens.space4))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(contentColor.copy(alpha = 0.15f)),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(fraction)
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(if (mine) GagaGreen else GagaGreen.copy(alpha = 0.6f)),
                    )
                }
            }
        }
        Spacer(Modifier.height(GagaDimens.space4))
        Text(
            text = if (totalVotes == 1) "1 vote" else "$totalVotes votes",
            style = MaterialTheme.typography.labelSmall,
            color = contentColor.copy(alpha = 0.7f),
        )
    }
}

/**
 * F21b: a live-location card. Shows a live pin, a countdown to expiry and, while
 * the share is active, a "Stop" action. The countdown ticks once a second; once
 * the share lapses the card degrades to a static location card.
 */
@Composable
private fun LiveLocationContent(
    message: Message,
    contentColor: Color,
    onStopLiveLocation: (Message) -> Unit,
) {
    val context = LocalContext.current
    val lat = message.latitude
    val lng = message.longitude
    val hasCoords = lat != null && lng != null
    val expiresAt = message.liveExpiresAt ?: 0L

    val now by produceState(initialValue = System.currentTimeMillis(), key1 = message.localId) {
        while (true) {
            value = System.currentTimeMillis()
            kotlinx.coroutines.delay(1_000)
        }
    }
    val remaining = (expiresAt - now).coerceAtLeast(0L)
    val active = remaining > 0L

    val openMap = {
        if (hasCoords) {
            val uri = Uri.parse("geo:$lat,$lng?q=$lat,$lng")
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            runCatching { context.startActivity(intent) }
        }
        Unit
    }

    Column(
        modifier = Modifier
            .width(240.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(124.dp)
                .clickable(enabled = hasCoords, onClick = openMap),
        ) {
            StylisedMap(modifier = Modifier.fillMaxSize())
            if (hasCoords) {
                AsyncImage(
                    model = mapTileUrl(lat!!, lng!!, 16),
                    contentDescription = "Live location",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            Icon(
                Icons.Filled.LocationOn,
                contentDescription = null,
                tint = if (active) GagaGreen else Color(0xFFE53935),
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(34.dp),
            )
            MapChip(
                text = if (active) "LIVE" else "Ended",
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(GagaDimens.space6),
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space12, vertical = GagaDimens.space8),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.NearMe,
                contentDescription = null,
                tint = if (active) GagaGreen else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(GagaDimens.iconSmall),
            )
            Spacer(Modifier.width(GagaDimens.space8))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (active) "Live location" else "Live location ended",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = if (active) {
                        "Updates for ${formatRemaining(remaining)}"
                    } else {
                        "Sharing stopped"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    start = GagaDimens.space4,
                    end = GagaDimens.space4,
                    bottom = GagaDimens.space4,
                ),
        ) {
            TextButton(onClick = openMap, enabled = hasCoords, modifier = Modifier.weight(1f)) {
                Text("Open map")
            }
            if (active) {
                TextButton(onClick = { onStopLiveLocation(message) }, modifier = Modifier.weight(1f)) {
                    Text("Stop")
                }
            }
        }
    }
}

private fun formatRemaining(millis: Long): String {
    val totalSeconds = (millis / 1000).coerceAtLeast(0)
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return if (minutes > 0) "${minutes}m ${seconds}s" else "${seconds}s"
}
