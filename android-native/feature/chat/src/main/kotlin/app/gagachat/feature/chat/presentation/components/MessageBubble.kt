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
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.CallMade
import androidx.compose.material.icons.filled.CallMissed
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Poll
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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
    selectionMode: Boolean = false,
    isSelected: Boolean = false,
    onToggleSelect: (Message) -> Unit = {},
    onRetry: () -> Unit,
    onMediaClick: (Message) -> Unit,
    onLongPress: (Message) -> Unit,
    onReactionClick: (Message, String) -> Unit,
    onReplyClick: (Message) -> Unit,
    onVotePoll: (Message, Int) -> Unit = { _, _ -> },
    onStopLiveLocation: (Message) -> Unit = {},
    onCallBack: (Boolean) -> Unit = {},
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
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (selectionMode) {
            SelectionCheck(selected = isSelected)
            Spacer(Modifier.width(GagaDimens.space8))
        }
        Column(horizontalAlignment = if (isOutgoing) Alignment.End else Alignment.Start) {
            Column(
                modifier = Modifier
                    .widthIn(max = 320.dp)
                    .clip(shape)
                    .background(bubbleColor)
                    .combinedClickable(
                        onClick = {
                            when {
                                selectionMode -> onToggleSelect(message)
                                message.type != MessageType.TEXT -> onMediaClick(message)
                            }
                        },
                        onLongClick = {
                            if (selectionMode) onToggleSelect(message) else onLongPress(message)
                        },
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
                        isOutgoing = isOutgoing,
                        onMediaClick = onMediaClick,
                        onRetry = onRetry,
                        currentUserId = currentUserId,
                        onVotePoll = onVotePoll,
                        onStopLiveLocation = onStopLiveLocation,
                        onCallBack = onCallBack,
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

/**
 * Leading selection affordance shown while the chat is in multi-select mode.
 * Filled when the row is selected, outlined otherwise (P1).
 */
@Composable
private fun SelectionCheck(selected: Boolean) {
    Icon(
        imageVector = if (selected) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
        contentDescription = if (selected) "Selected" else "Not selected",
        tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
        modifier = Modifier.size(22.dp),
    )
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
    isOutgoing: Boolean,
    onMediaClick: (Message) -> Unit,
    onRetry: () -> Unit,
    currentUserId: String,
    onVotePoll: (Message, Int) -> Unit,
    onStopLiveLocation: (Message) -> Unit,
    onCallBack: (Boolean) -> Unit,
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
            MultiImageGrid(message = message, onRetry = onRetry, onClick = { onMediaClick(message) })
        } else {
            MediaImage(
                message = message,
                contentColor = contentColor,
                onRetry = onRetry,
                onClick = { onMediaClick(message) },
            )
        }
        MessageType.VIDEO -> MediaVideo(
            message = message,
            contentColor = contentColor,
            onRetry = onRetry,
            onClick = { onMediaClick(message) },
        )
        MessageType.AUDIO -> AudioContent(message = message, contentColor = contentColor)
        MessageType.FILE -> FileContent(
            message = message,
            contentColor = contentColor,
            onRetry = onRetry,
        )
        MessageType.LOCATION -> LocationContent(message = message)
        MessageType.CONTACT -> ContactContent(message = message, contentColor = contentColor)
        MessageType.CALL_EVENT -> CallEventContent(
            message = message,
            contentColor = contentColor,
            isOutgoing = isOutgoing,
            onCallBack = onCallBack,
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

/**
 * Result of applying the "Data & Storage" auto-download policy to a single
 * remote media URL. [url] is null while the fetch is gated; [needsPrompt] tells
 * the caller to render a "tap to load" affordance; [requestLoad] flips the
 * per-message escape hatch so the next recomposition resolves the URL.
 */
private class GatedMediaUrl(
    val url: String?,
    val needsPrompt: Boolean,
    val requestLoad: () -> Unit,
)

/**
 * Resolves [raw] through the signed-URL resolver but honours the user's
 * auto-download policy. A per-message "load anyway" flag lets a single bubble be
 * fetched on demand without changing the global preference.
 */
@Composable
private fun rememberGatedRemoteUrl(key: String, raw: String?): GatedMediaUrl {
    val autoAllowed = rememberAutoDownloadAllowed()
    var manualLoad by rememberSaveable(key) { mutableStateOf(false) }
    val allowed = autoAllowed || manualLoad
    val resolved = rememberSignedMediaUrl(raw, autoDownload = allowed)
    val remote = !raw.isNullOrBlank() && raw.startsWith("http")
    return GatedMediaUrl(
        url = resolved,
        needsPrompt = remote && !allowed,
        requestLoad = { manualLoad = true },
    )
}

/**
 * Overlay shown on a media bubble whose fetch is paused by the auto-download
 * policy. Tapping it loads just this item.
 */
@Composable
private fun MediaDownloadPrompt(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.38f))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Filled.Download,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(28.dp),
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Tap to load",
                style = MaterialTheme.typography.labelMedium,
                color = Color.White,
            )
        }
    }
}

/** The kind of attachment an unloaded media card stands in for. */
private enum class MediaKind(val icon: ImageVector, val label: String) {
    PHOTO(Icons.Filled.Image, "Photo"),
    VIDEO(Icons.Filled.Videocam, "Video"),
    FILE(Icons.Filled.Description, "Attachment"),
}

/**
 * The single status surface a media bubble may show at any moment.
 *
 * A media bubble can legitimately be in several states at once from the data's
 * point of view (no preview yet *and* an upload in flight *and* gated by the
 * auto-download policy). Rendering a surface per condition is what produced the
 * overlapping "Preparing…" labels: the placeholder card *and* the upload scrim
 * were both drawn in the same box. [mediaStatus] collapses those conditions into
 * exactly one value so the caller renders exactly one surface.
 */
private enum class MediaStatus {
    /** A renderable preview exists and there is nothing to report. */
    NONE,

    /** The sender's own upload is still in flight. */
    UPLOADING,

    /** The sender's own upload failed and can be retried. */
    UPLOAD_FAILED,

    /** Received media whose fetch is paused by the auto-download policy. */
    GATED,

    /** Received media whose signed URL is still being minted. */
    RESOLVING,
}

/**
 * Resolves the one status a media bubble should show.
 *
 * Order matters: the sender's own upload (no committed `mediaUrl`) always wins,
 * because a local preview must still show progress over it. Only once the media
 * is committed to the server does the auto-download gate / signing state apply.
 */
private fun mediaStatus(message: Message, hasPreview: Boolean, gated: Boolean): MediaStatus = when {
    message.mediaUrl == null && message.isFailed -> MediaStatus.UPLOAD_FAILED
    message.mediaUrl == null && message.isPending -> MediaStatus.UPLOADING
    hasPreview -> MediaStatus.NONE
    gated -> MediaStatus.GATED
    else -> MediaStatus.RESOLVING
}

/**
 * A neutral attachment card shown while a media item has no renderable model yet
 * (still uploading, being signed, or gated by the data policy). It names the
 * kind, shows the size when known and surfaces the upload lifecycle so a bubble
 * is never an unexplained grey box (P0). When [status] is [MediaStatus.UPLOAD_FAILED]
 * the whole card is tappable to retry the upload; when it is [MediaStatus.GATED]
 * the card is tappable to load just this item.
 *
 * The label is derived from [status] rather than always reading "Preparing…", so
 * a *received* item that is merely awaiting its signed URL no longer claims to be
 * preparing, and the card is never drawn underneath [UploadStatusOverlay].
 */
@Composable
private fun MediaPlaceholder(
    kind: MediaKind,
    sizeBytes: Long?,
    status: MediaStatus,
    progress: Int?,
    onRetry: (() -> Unit)?,
    onLoad: (() -> Unit)?,
    tint: Color,
    modifier: Modifier = Modifier,
) {
    val subtitle = when (status) {
        MediaStatus.UPLOAD_FAILED -> "Tap to retry"
        MediaStatus.UPLOADING -> when {
            progress == null || progress <= 0 -> "Preparing\u2026"
            progress < 100 -> "$progress%"
            else -> "Finishing\u2026"
        }
        MediaStatus.GATED -> "Tap to load"
        MediaStatus.RESOLVING -> "Loading\u2026"
        MediaStatus.NONE -> null
    }
    // The card is actionable for the two states that have a real recovery: a
    // failed upload (retry) and a policy-gated fetch (load just this item).
    // Every other state is informational, so the card stays inert.
    val action = when (status) {
        MediaStatus.UPLOAD_FAILED -> onRetry
        MediaStatus.GATED -> onLoad
        else -> null
    }
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(tint.copy(alpha = 0.08f))
            .then(
                if (action != null) Modifier.clickable(onClick = action) else Modifier,
            )
            .padding(horizontal = GagaDimens.space12, vertical = GagaDimens.space8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = kind.icon,
            contentDescription = kind.label,
            tint = tint.copy(alpha = 0.85f),
            modifier = Modifier.size(28.dp),
        )
        Spacer(Modifier.height(GagaDimens.space4))
        Text(
            text = kind.label,
            style = MaterialTheme.typography.labelMedium,
            color = tint,
            fontWeight = FontWeight.SemiBold,
        )
        if (subtitle != null) {
            Spacer(Modifier.height(2.dp))
            Text(
                text = subtitle,
                style = MaterialTheme.typography.labelSmall,
                color = tint.copy(alpha = 0.75f),
            )
        }
        if (sizeBytes != null && sizeBytes > 0L) {
            Spacer(Modifier.height(2.dp))
            Text(
                text = formatBytes(sizeBytes),
                style = MaterialTheme.typography.labelSmall,
                color = tint.copy(alpha = 0.55f),
            )
        }
        if (status == MediaStatus.UPLOADING) {
            val fraction = ((progress ?: 0).coerceIn(0, 100)) / 100f
            if (fraction > 0f) {
                Spacer(Modifier.height(GagaDimens.space6))
                LinearProgressIndicator(
                    progress = { fraction },
                    modifier = Modifier
                        .width(96.dp)
                        .height(3.dp)
                        .clip(RoundedCornerShape(2.dp)),
                    color = tint,
                    trackColor = tint.copy(alpha = 0.2f),
                )
            }
        }
    }
}

@Composable
private fun MediaImage(
    message: Message,
    contentColor: Color,
    onRetry: () -> Unit,
    onClick: () -> Unit,
) {
    val gate = rememberGatedRemoteUrl(message.localId, message.mediaUrl)
    val model = rememberExistingLocalMedia(message.localMediaPath) ?: gate.url
    val hasPreview = model != null
    val status = mediaStatus(message, hasPreview = hasPreview, gated = gate.needsPrompt)
    Box(
        modifier = Modifier
            .size(width = 220.dp, height = 160.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(enabled = hasPreview || gate.needsPrompt) {
                if (gate.needsPrompt) gate.requestLoad() else onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        if (hasPreview) {
            AsyncImage(
                model = model,
                contentDescription = "Photo",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            // Drawn only over a real preview, so the upload lifecycle can never
            // collide with the placeholder card's own progress (the V3.0 defect).
            UploadStatusOverlay(status = status, progress = message.uploadProgress, onRetry = onRetry)
        } else {
            // One surface for every "no preview yet" state (uploading, failed,
            // gated, resolving) so the bubble is never an unexplained grey box and
            // never stacks two lifecycle labels on top of each other (P0).
            MediaPlaceholder(
                kind = MediaKind.PHOTO,
                sizeBytes = message.mediaSize,
                status = status,
                progress = message.uploadProgress,
                onRetry = onRetry,
                onLoad = gate.requestLoad,
                tint = contentColor,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/**
 * Distinguishes the media upload lifecycle *over a rendered preview* (F04):
 * preparing, uploading with a percentage, and failed. A bare percentage with a
 * pending clock gave the user no explanation or recovery affordance. The failed
 * state is tappable so the retry affordance is real, not just a label (P0).
 *
 * This scrim is deliberately restricted to [MediaStatus.UPLOADING] and
 * [MediaStatus.UPLOAD_FAILED]. When a bubble has no preview the same lifecycle is
 * drawn by [MediaPlaceholder] instead; letting both render at once is exactly the
 * V3.0 defect where "Preparing\u2026" appeared twice over a video bubble.
 */
@Composable
private fun UploadStatusOverlay(status: MediaStatus, progress: Int?, onRetry: () -> Unit) {
    if (status != MediaStatus.UPLOADING && status != MediaStatus.UPLOAD_FAILED) return
    val failed = status == MediaStatus.UPLOAD_FAILED
    val label = when {
        failed -> "Failed \u2014 tap to retry"
        progress == null || progress <= 0 -> "Preparing\u2026"
        progress < 100 -> "$progress%"
        else -> "Finishing\u2026"
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.38f))
            .then(
                if (failed) Modifier.clickable(onClick = onRetry) else Modifier,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (!failed) {
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
private fun MultiImageGrid(message: Message, onRetry: () -> Unit, onClick: () -> Unit) {
    val urls = message.allMediaUrls
    val autoAllowed = rememberAutoDownloadAllowed()
    var manualLoad by rememberSaveable(message.localId) { mutableStateOf(false) }
    val allowed = autoAllowed || manualLoad
    val signedUrls = rememberSignedMediaUrls(urls, autoDownload = allowed)
    val shown = signedUrls.take(4)
    val needsPrompt = !allowed && urls.any { it.startsWith("http") }
    val hasPreview = shown.any { it != null }
    val status = mediaStatus(message, hasPreview = hasPreview, gated = needsPrompt)
    Box(
        modifier = Modifier
            .width(220.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable {
                if (needsPrompt) manualLoad = true else onClick()
            },
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
                            } else if (!needsPrompt) {
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
        // Exactly one lifecycle surface over the grid: the upload scrim while the
        // sender's album is still in flight, otherwise the auto-download gate.
        // They are mutually exclusive by construction, so the grid can never stack
        // two labels the way the video bubble used to (V3.0 defect).
        UploadStatusOverlay(status = status, progress = message.uploadProgress, onRetry = onRetry)
        if (status == MediaStatus.GATED) {
            MediaDownloadPrompt(onClick = { manualLoad = true })
        }
    }
}

@Composable
private fun MediaVideo(message: Message, contentColor: Color, onRetry: () -> Unit, onClick: () -> Unit) {
    // Prefer a local frame (instant, offline), then the signed remote thumbnail,
    // then the local video file itself so a pending upload still shows a frame.
    val gate = rememberGatedRemoteUrl(message.localId, message.thumbnailUrl)
    val thumb = rememberExistingLocalMedia(message.thumbnailUrl)
        ?: gate.url
        ?: rememberExistingLocalMedia(message.localMediaPath)
    val hasPreview = thumb != null
    val status = mediaStatus(message, hasPreview = hasPreview, gated = gate.needsPrompt)
    Box(
        modifier = Modifier
            .size(width = 220.dp, height = 160.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable {
                if (gate.needsPrompt) gate.requestLoad() else onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        if (hasPreview) {
            AsyncImage(
                model = thumb,
                contentDescription = "Video",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
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
                    contentDescription = "Play video",
                    tint = Color.White,
                    modifier = Modifier.size(40.dp),
                )
            }
        } else {
            // Single surface while the frame is unavailable (uploading, failed,
            // gated or resolving). This is the fix for the stacked
            // "Preparing\u2026" label + spinner the video bubble used to show.
            MediaPlaceholder(
                kind = MediaKind.VIDEO,
                sizeBytes = message.mediaSize,
                status = status,
                progress = message.uploadProgress,
                onRetry = onRetry,
                onLoad = gate.requestLoad,
                tint = contentColor,
                modifier = Modifier.fillMaxSize(),
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
        // The upload scrim is drawn only over a real frame; when there is no frame
        // the placeholder above already carries the lifecycle, so drawing both is
        // the exact double-label defect this change removes.
        if (hasPreview) {
            UploadStatusOverlay(status = status, progress = message.uploadProgress, onRetry = onRetry)
        }
    }
}

@Composable
private fun AudioContent(message: Message, contentColor: Color) {
    val player = rememberVoicePlayer()
    val gate = rememberGatedRemoteUrl(message.localId, message.mediaUrl)
    val source = rememberExistingLocalMedia(message.localMediaPath) ?: gate.url
    val playable = !source.isNullOrBlank()
    val bound = player.activeSource != null && player.activeSource == source
    val totalMs = if (bound && player.durationMs > 0L) player.durationMs else (message.mediaDurationMs ?: 0L)
    val positionMs = if (bound) player.positionMs else 0L
    val showRetry = bound && player.error

    Column(
        modifier = Modifier
            .width(220.dp)
            .clip(RoundedCornerShape(12.dp))
            .padding(vertical = GagaDimens.space2, horizontal = GagaDimens.space2),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // While a private-bucket voice note is being exchanged for a signed
            // URL the source is null; show a spinner instead of a dead play
            // button so a tap is never silently ignored. When the fetch is gated
            // by the auto-download policy we show a download glyph instead, since
            // a tap will start the download rather than play.
            when {
                gate.needsPrompt -> IconButton(
                    onClick = gate.requestLoad,
                    modifier = Modifier.size(40.dp),
                ) {
                    Icon(
                        Icons.Filled.Download,
                        contentDescription = "Tap to load voice message",
                        tint = contentColor,
                    )
                }
                !playable -> Box(
                    modifier = Modifier.size(40.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = contentColor,
                    )
                }
                showRetry -> IconButton(
                    onClick = { player.toggle(source) },
                    modifier = Modifier.size(40.dp),
                ) {
                    Icon(
                        Icons.Filled.Refresh,
                        contentDescription = "Retry audio",
                        tint = MaterialTheme.colorScheme.error,
                    )
                }
                bound && player.isPreparing -> Box(
                    modifier = Modifier.size(40.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = contentColor,
                    )
                }
                else -> IconButton(
                    onClick = { player.toggle(source) },
                    modifier = Modifier.size(40.dp),
                ) {
                    Icon(
                        imageVector = if (bound && player.isPlaying) {
                            Icons.Filled.Pause
                        } else {
                            Icons.Filled.PlayArrow
                        },
                        contentDescription = if (bound && player.isPlaying) "Pause audio" else "Play audio",
                        tint = contentColor,
                    )
                }
            }
            Spacer(Modifier.width(GagaDimens.space4))
            Column(modifier = Modifier.weight(1f)) {
                Slider(
                    value = if (totalMs > 0L) {
                        (positionMs.toFloat() / totalMs.toFloat()).coerceIn(0f, 1f)
                    } else {
                        0f
                    },
                    onValueChange = { fraction -> player.seekTo((fraction * totalMs).toLong()) },
                    enabled = playable && bound && totalMs > 0L,
                    modifier = Modifier.height(28.dp),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = TimeFormat.callDuration(positionMs),
                        style = MaterialTheme.typography.labelSmall,
                        color = contentColor.copy(alpha = 0.8f),
                    )
                    Spacer(Modifier.weight(1f))
                    Text(
                        text = if (totalMs > 0L) TimeFormat.callDuration(totalMs) else "Voice message",
                        style = MaterialTheme.typography.labelSmall,
                        color = contentColor.copy(alpha = 0.8f),
                    )
                }
            }
        }
    }
}

@Composable
private fun FileContent(message: Message, contentColor: Color, onRetry: () -> Unit) {
    // A file that has neither a local copy nor a server URL yet is still being
    // prepared/uploaded (or failed); show the attachment card so the bubble is
    // never an unexplained blank (P0). Files are never auto-download gated, so the
    // only states reachable here are uploading / failed / resolving.
    val hasSource = !message.localMediaPath.isNullOrBlank() || !message.mediaUrl.isNullOrBlank()
    if (!hasSource) {
        MediaPlaceholder(
            kind = MediaKind.FILE,
            sizeBytes = message.mediaSize,
            status = mediaStatus(message, hasPreview = false, gated = false),
            progress = message.uploadProgress,
            onRetry = onRetry,
            onLoad = null,
            tint = contentColor,
            modifier = Modifier.widthIn(min = 176.dp),
        )
        return
    }
    val status = mediaStatus(message, hasPreview = true, gated = false)
    Box {
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
        // Only the sender's own in-flight upload draws over the file row; a
        // committed file resolves to NONE and shows no lifecycle surface.
        UploadStatusOverlay(status = status, progress = message.uploadProgress, onRetry = onRetry)
    }
}

/**
 * The terminal outcome of a call, derived from the persisted CALL_EVENT text.
 * Kept separate from [CallStatus] because a single chat line collapses several
 * signalling states (e.g. a busy line reads as "missed") into one user-facing
 * result (P0).
 */
private enum class CallOutcome(val label: String) {
    MISSED("Missed"),
    DECLINED("Declined"),
    CANCELLED("Cancelled"),
    FAILED("Failed"),
    ANSWERED("Answered"),
}

private data class ParsedCallEvent(
    val outcome: CallOutcome,
    val isVideo: Boolean,
    val durationText: String?,
)

/**
 * Parses the human-readable CALL_EVENT text (produced by
 * `CallRepository.callEventText`) back into a structured outcome. The duration is
 * only ever present for answered calls, so it doubles as the "was connected"
 * signal.
 */
private fun parseCallEvent(text: String?): ParsedCallEvent {
    val raw = text.orEmpty()
    val lower = raw.lowercase(Locale.US)
    val isVideo = lower.contains("video")
    val outcome = when {
        lower.contains("declined") || lower.contains("rejected") -> CallOutcome.DECLINED
        lower.contains("cancelled") || lower.contains("canceled") -> CallOutcome.CANCELLED
        lower.contains("failed") -> CallOutcome.FAILED
        lower.contains("missed") || lower.contains("busy") -> CallOutcome.MISSED
        else -> CallOutcome.ANSWERED
    }
    val durationText = raw.substringAfter('\u2022', "").trim().takeIf { it.isNotEmpty() }
    return ParsedCallEvent(outcome = outcome, isVideo = isVideo, durationText = durationText)
}

/**
 * Renders a call-log entry inside the chat: a directional icon, the call kind
 * and the outcome, tinted with the error colour when the call was not answered
 * (P0). Duration is shown only for connected calls.
 */
@Composable
private fun CallEventContent(
    message: Message,
    contentColor: Color,
    isOutgoing: Boolean,
    onCallBack: (Boolean) -> Unit,
) {
    val parsed = remember(message.text) { parseCallEvent(message.text) }
    val kindLabel = if (parsed.isVideo) "Video call" else "Voice call"
    val icon = when (parsed.outcome) {
        CallOutcome.MISSED -> if (isOutgoing) Icons.Filled.CallMade else Icons.Filled.CallMissed
        CallOutcome.DECLINED -> Icons.Filled.CallEnd
        CallOutcome.CANCELLED -> Icons.Filled.CallMade
        CallOutcome.FAILED -> Icons.Filled.CallEnd
        CallOutcome.ANSWERED -> if (isOutgoing) Icons.Filled.CallMade else Icons.Filled.Call
    }
    val unanswered = parsed.outcome != CallOutcome.ANSWERED
    val accent = if (unanswered) MaterialTheme.colorScheme.error else contentColor
    // Answered calls carry a duration; unanswered ones carry the outcome label.
    val subtitle = parsed.durationText ?: parsed.outcome.label
    Row(
        verticalAlignment = Alignment.CenterVertically,
        // Tapping the call-log entry redials the same kind of call (P0). The
        // inner clickable consumes the tap so the bubble's media handler does not
        // also fire for a call event.
        modifier = Modifier.clickable { onCallBack(parsed.isVideo) },
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(accent.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = kindLabel,
                tint = accent,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(Modifier.width(GagaDimens.space8))
        Column(modifier = Modifier.weight(1f, fill = false)) {
            Text(
                text = kindLabel,
                style = MaterialTheme.typography.bodyMedium,
                color = contentColor,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.labelSmall,
                color = accent.copy(alpha = 0.9f),
            )
        }
        Spacer(Modifier.width(GagaDimens.space12))
        Icon(
            imageVector = Icons.Filled.Call,
            contentDescription = "Call back",
            tint = contentColor.copy(alpha = 0.7f),
            modifier = Modifier.size(18.dp),
        )
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

    // Screen-reader friendly description for the whole card.
    val a11yLabel = if (hasCoords) "$placeLabel at $coordsText" else placeLabel

    Column(
        modifier = Modifier
            .width(240.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .semantics { contentDescription = a11yLabel },
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(124.dp)
                .clickable(enabled = hasCoords, onClick = openMap)
                .semantics {
                    contentDescription = if (hasCoords) {
                        "Map preview. $placeLabel. Double tap to open in maps"
                    } else {
                        "Map preview unavailable"
                    }
                },
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
                color = contentColor.copy(alpha = 0.78f),
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.width(GagaDimens.space4))
        }
        if (message.isScheduled) {
            Text(
                text = "Scheduled",
                style = MaterialTheme.typography.labelSmall,
                color = contentColor.copy(alpha = 0.78f),
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.width(GagaDimens.space4))
        }
        Text(
            text = TimeFormat.messageTime(message.sortTimestamp),
            style = MaterialTheme.typography.labelSmall,
            color = contentColor.copy(alpha = 0.78f),
            fontWeight = FontWeight.Medium,
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
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .semantics {
                contentDescription = if (active) {
                    "Live location, updates for ${formatRemaining(remaining)}"
                } else {
                    "Live location ended"
                }
            },
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(124.dp)
                .clickable(enabled = hasCoords, onClick = openMap)
                .semantics {
                    contentDescription = if (hasCoords) {
                        "Live map preview. Double tap to open in maps"
                    } else {
                        "Map preview unavailable"
                    }
                },
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
