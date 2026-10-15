package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Audiotrack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.EmojiEmotions
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Poll
import androidx.compose.material.icons.filled.RequestQuote
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.gagachat.core.model.Message
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen
import app.gagachat.core.ui.theme.GagaGreenContainer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import app.gagachat.core.ui.util.TimeFormat

/**
 * The message composer (reference screenshot 174452). A round "+" opens the
 * attachment sheet, a compact emoji affordance and one trailing primary action
 * that changes between record/send/save. Scheduling is in the attachment menu. Shows a reply quote or an edit banner
 * above the field when active and swaps the field for a recording strip while a
 * voice clip is being captured.
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
    recordingLevels: List<Float> = emptyList(),
    onStartRecording: () -> Unit,
    onStopRecording: () -> Unit,
    onCancelRecording: () -> Unit,
    onShareLiveLocation: () -> Unit = onShareLocation,
    onSendPoll: () -> Unit = {},
    onScheduleClick: () -> Unit = {},
    /**
     * Opens the P2P coin transfer flow. This routes to the real `wallet_transfer`
     * RPC (server-authoritative ledger), never a client-side balance mutation.
     */
    onTransferCoins: () -> Unit = {},
    /** Opens the shared-expense split flow backed by the real split-bill RPCs. */
    onSplitBill: () -> Unit = {},
    /** Opens the authoritative wallet ledger (payment history) screen. */
    onOpenPaymentHistory: () -> Unit = {},
    /** `chats.enterToSend` — Enter sends the message instead of inserting a newline. */
    enterToSend: Boolean = true,
    modifier: Modifier = Modifier,
) {
    var showAttachSheet by remember { mutableStateOf(false) }
    var showEmojiPanel by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState()
    val haptics = LocalHapticFeedback.current
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        tonalElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding(),
        ) {
            androidx.compose.material3.HorizontalDivider(
                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.2f),
            )
            if (editingMessage != null && !isRecording) {
                EditBanner(message = editingMessage, onCancel = onCancelEdit)
            } else if (replyTo != null && !isRecording) {
                ReplyPreview(message = replyTo, onCancel = onCancelReply)
            }
            if (showEmojiPanel && !isRecording) {
                EmojiPanel(onPick = { emoji -> onDraftChange(draft + emoji) })
            }
            if (isRecording) {
                RecordingBar(
                    elapsedMs = recordingElapsedMs,
                    levels = recordingLevels,
                    onCancel = onCancelRecording,
                    onSend = onStopRecording,
                )
            } else {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = GagaDimens.space12, vertical = GagaDimens.space8),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    // Round "+" affordance that opens the attachment sheet.
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary)
                            .clickable {
                                // Dismiss the keyboard first so the sheet is not
                                // pushed off-screen; the draft is preserved in
                                // the hoisted state.
                                focusManager.clearFocus()
                                keyboardController?.hide()
                                showEmojiPanel = false
                                showAttachSheet = true
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Filled.Add,
                            contentDescription = "Attach",
                            tint = MaterialTheme.colorScheme.onPrimary,
                        )
                    }
                    Spacer(Modifier.width(GagaDimens.space8))
                    TextField(
                        value = draft,
                        onValueChange = onDraftChange,
                        modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                        placeholder = { Text(if (editingMessage != null) "Edit message" else "Message…") },
                        maxLines = 6,
                        shape = RoundedCornerShape(24.dp),
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent,
                        ),
                        keyboardOptions = KeyboardOptions(
                            imeAction = if (enterToSend) ImeAction.Send else ImeAction.Default,
                        ),
                        keyboardActions = KeyboardActions(
                            onSend = { if (enterToSend && draft.isNotBlank()) onSend() },
                        ),
                        trailingIcon = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                IconButton(onClick = { showEmojiPanel = !showEmojiPanel }) {
                                    Icon(
                                        Icons.Filled.EmojiEmotions,
                                        contentDescription = if (showEmojiPanel) "Close emoji picker" else "Open emoji picker",
                                        tint = if (showEmojiPanel) {
                                            MaterialTheme.colorScheme.primary
                                        } else {
                                            MaterialTheme.colorScheme.onSurfaceVariant
                                        },
                                    )
                                }

                            }
                        },
                    )
                    Spacer(Modifier.width(GagaDimens.space4))
                    if (draft.isBlank() && editingMessage == null) {
                        FilledIconButton(
                            onClick = onStartRecording,
                            shape = CircleShape,
                            modifier = Modifier.size(48.dp),
                        ) {
                            Icon(Icons.Filled.Mic, contentDescription = "Record voice message")
                        }
                    } else {
                        FilledIconButton(
                            onClick = {
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                onSend()
                            },
                            enabled = draft.isNotBlank(),
                            shape = CircleShape,
                            modifier = Modifier.size(48.dp),
                        ) {
                            if (editingMessage != null) {
                                Icon(Icons.Filled.Edit, contentDescription = "Save edit")
                            } else {
                                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send message")
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
                onPickContact = { showAttachSheet = false; onPickContact() },
                onShareLocation = { showAttachSheet = false; onShareLocation() },
                onShareLiveLocation = { showAttachSheet = false; onShareLiveLocation() },
                onPickFile = { showAttachSheet = false; onAttach() },
                onSendPoll = { showAttachSheet = false; onSendPoll() },
                onScheduleClick = { showAttachSheet = false; onScheduleClick() },
                onTransferCoins = { showAttachSheet = false; onTransferCoins() },
                onSplitBill = { showAttachSheet = false; onSplitBill() },
                onOpenPaymentHistory = { showAttachSheet = false; onOpenPaymentHistory() },
            )
        }
    }
}

/**
 * One tile in the attachment sheet. [enabled] = false renders a visibly disabled
 * tile with an optional [badge] so a capability that has no backend yet can never
 * be mistaken for a working one.
 */
private data class AttachItem(
    val icon: ImageVector,
    val label: String,
    val onClick: () -> Unit,
    val enabled: Boolean = true,
    val badge: String? = null,
)

/**
 * Attachment grid (reference screenshot 174602): a four-column grid of green
 * icons on light-green circular tiles — Photos / Camera / Video / Audio file,
 * Contact / Location / Live location / Document, then Poll. A dedicated "Money"
 * section sits below it and routes to the real wallet/split-bill backend.
 */
@Composable
private fun AttachmentSheet(
    onPickImage: () -> Unit,
    onTakePhoto: () -> Unit,
    onPickVideo: () -> Unit,
    onPickAudio: () -> Unit,
    onPickContact: () -> Unit,
    onShareLocation: () -> Unit,
    onShareLiveLocation: () -> Unit,
    onPickFile: () -> Unit,
    onSendPoll: () -> Unit,
    onScheduleClick: () -> Unit,
    onTransferCoins: () -> Unit,
    onSplitBill: () -> Unit,
    onOpenPaymentHistory: () -> Unit,
) {
    var moneyExpanded by remember { mutableStateOf(false) }
    val mediaOptions = listOf(
        AttachItem(Icons.Filled.Image, "Photos", onPickImage),
        AttachItem(Icons.Filled.CameraAlt, "Camera", onTakePhoto),
        AttachItem(Icons.Filled.Videocam, "Video", onPickVideo),
        AttachItem(Icons.Filled.Description, "Document", onPickFile),
        AttachItem(Icons.Filled.LocationOn, "Location", onShareLocation),
        AttachItem(Icons.Filled.NearMe, "Live location", onShareLiveLocation),
        AttachItem(Icons.Filled.Person, "Contact", onPickContact),
        AttachItem(Icons.Filled.Audiotrack, "Audio file", onPickAudio),
    )
    val actionOptions = listOf(
        AttachItem(Icons.Filled.Poll, "Poll", onSendPoll),
        AttachItem(Icons.Filled.Schedule, "Schedule", onScheduleClick),
    )
    // Money actions. Transfer / Split bill / History are wired to real server RPCs
    // and the authoritative ledger. Request / Gift coins are shown but disabled
    // ("Soon") because no backend exists yet — a disabled tile cannot fake success.
    val moneyOptions = listOf(
        AttachItem(Icons.Filled.SwapHoriz, "Transfer", onTransferCoins),
        AttachItem(Icons.AutoMirrored.Filled.ReceiptLong, "Split bill", onSplitBill),
        AttachItem(Icons.Filled.History, "History", onOpenPaymentHistory),
        AttachItem(Icons.Filled.RequestQuote, "Request", {}, enabled = false, badge = "Soon"),
        AttachItem(Icons.Filled.CardGiftcard, "Gift coins", {}, enabled = false, badge = "Soon"),
    )
    BoxWithConstraints {
        val columns = if (maxWidth < 360.dp || LocalDensity.current.fontScale > 1.2f) 3 else 4
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 520.dp)
                // Keep every option reachable on short screens / landscape instead of
                // letting the last row fall off the bottom of the sheet.
                .verticalScroll(rememberScrollState())
                .padding(bottom = GagaDimens.space24),
        ) {
            Text(
                text = "Share in chat",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
            )
            Text(
                text = "Review and edit photos or videos before sending.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = GagaDimens.space16),
            )
            AttachGrid(options = mediaOptions, columns = columns)
            Text(
                text = "Plan & organize",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
            )
            AttachGrid(options = actionOptions, columns = columns)
            TextButton(
                onClick = { moneyExpanded = !moneyExpanded },
                modifier = Modifier.padding(horizontal = GagaDimens.space8),
            ) {
                Text(if (moneyExpanded) "Hide money tools" else "Money tools (coins) · Show")
            }
            if (moneyExpanded) {
                AttachGrid(options = moneyOptions, columns = columns)
                Text(
                    "Real-money payments are not enabled. Coin tools require an active wallet.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = GagaDimens.space16),
                )
            }
        }
    }
}

@Composable
private fun AttachGrid(options: List<AttachItem>, columns: Int) {
    options.chunked(columns).forEach { row ->
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space4),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            row.forEach { item ->
                AttachOption(
                    icon = item.icon,
                    label = item.label,
                    onClick = item.onClick,
                    enabled = item.enabled,
                    badge = item.badge,
                    modifier = Modifier.weight(1f),
                )
            }
            // Pad the final (partial) row so its items stay aligned to the
            // four-column grid instead of drifting to the centre.
            repeat(columns - row.size) {
                Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun AttachOption(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    badge: String? = null,
) {
    val tileColor = if (enabled) GagaGreenContainer else MaterialTheme.colorScheme.surfaceVariant
    val iconTint = if (enabled) GagaGreen else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
            .clip(MaterialTheme.shapes.medium)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(GagaDimens.space4),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(CircleShape)
                    .background(tileColor),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = label, tint = iconTint)
            }
            if (badge != null) {
                Surface(
                    color = MaterialTheme.colorScheme.tertiaryContainer,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.align(Alignment.TopEnd),
                ) {
                    Text(
                        text = badge,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onTertiaryContainer,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp),
                    )
                }
            }
        }
        Spacer(Modifier.size(GagaDimens.space4))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 2,
            textAlign = TextAlign.Center,
            overflow = TextOverflow.Ellipsis,
            color = if (enabled) {
                MaterialTheme.colorScheme.onSurface
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
            },
        )
    }
}

/**
 * Active-recording strip: a pulsing red dot, the elapsed timer and cancel/send
 * actions. Replaces the text field while the mic is live.
 */
@Composable
private fun RecordingBar(
    elapsedMs: Long,
    levels: List<Float>,
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
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
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
                )
            }
            Spacer(Modifier.height(GagaDimens.space4))
            RecordingWaveform(
                levels = levels,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(28.dp),
            )
        }
        Spacer(Modifier.width(GagaDimens.space8))
        FilledIconButton(
            onClick = onSend,
            shape = CircleShape,
            modifier = Modifier.size(48.dp),
        ) {
            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send voice message")
        }
    }
}

/**
 * Live amplitude waveform for the active recording. A fixed number of slots is
 * drawn so the bars scroll right-to-left as new samples arrive; quiet slots are
 * shown as faint tracks. This gives real visual feedback that the mic is
 * capturing audio (P1) instead of a static "Recording" label.
 */
@Composable
private fun RecordingWaveform(levels: List<Float>, modifier: Modifier = Modifier) {
    val barColor = MaterialTheme.colorScheme.error
    val trackColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.25f)
    Canvas(modifier = modifier) {
        val slots = 40
        val gap = 3.dp.toPx()
        val barWidth = ((size.width - gap * (slots - 1)) / slots).coerceAtLeast(1f)
        val recent = if (levels.size > slots) levels.takeLast(slots) else levels
        val offset = slots - recent.size
        for (i in 0 until slots) {
            val levelIndex = i - offset
            val inRange = levelIndex in recent.indices
            val level = if (inRange) recent[levelIndex].coerceIn(0f, 1f) else 0f
            val barHeight = (size.height * level).coerceAtLeast(barWidth * 0.5f)
            val x = i * (barWidth + gap)
            val top = (size.height - barHeight) / 2f
            drawRoundRect(
                color = if (inRange) barColor else trackColor,
                topLeft = Offset(x, top),
                size = Size(barWidth, barHeight),
                cornerRadius = CornerRadius(barWidth / 2f, barWidth / 2f),
            )
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

/**
 * A real, self-contained emoji picker (no external dependency). Tapping an emoji
 * appends it to the current draft via [onPick]. Categories switch with a
 * horizontally scrollable tab strip, and the emoji grid is a lazy 8-column layout
 * so only the visible glyphs are composed.
 */
private data class EmojiCategory(val label: String, val emojis: List<String>)

private val emojiCategories: List<EmojiCategory> = listOf(
    EmojiCategory(
        "Smileys",
        listOf(
            "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃",
            "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜",
            "🤪", "🤨", "🧐", "🤓", "😎", "🥳", "🤩", "😏", "😒", "😞", "😔", "😟",
            "😕", "🙁", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡",
            "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔",
            "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮",
            "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷",
        ),
    ),
    EmojiCategory(
        "Gestures",
        listOf(
            "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇",
            "☝️", "✋", "🤚", "🖐️", "🖖", "👋", "🤝", "🙏", "✊", "👊", "🤛", "🤜",
            "👏", "🙌", "👐", "🤲", "💪", "🦾", "✍️", "💅", "🤳", "🧑", "👶", "🧒",
            "👦", "👧", "🧓", "👨", "👩", "👴", "👵", "🙈", "🙉", "🙊", "💁", "🙅",
            "🙆", "🙋", "🧏", "🙇", "🤦", "🤷", "👮", "🕵️", "💂", "👷", "🤴", "👸",
        ),
    ),
    EmojiCategory(
        "Symbols",
        listOf(
            "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕",
            "💞", "💓", "💗", "💖", "💘", "💝", "💟", "✨", "⭐", "🌟", "💫", "⚡",
            "🔥", "💥", "💯", "🎉", "🎊", "🎈", "🎁", "🏆", "🥇", "✅", "❌", "❗",
            "❓", "💤", "💢", "💬", "💭", "♻️", "🔰", "✳️", "❇️", "🔱", "⚜️", "🆗",
            "🆒", "🆕", "🔝", "🔙", "🔜", "🔚", "⭕", "🚫", "💲", "➕", "➖", "✔️",
        ),
    ),
    EmojiCategory(
        "Nature",
        listOf(
            "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮",
            "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤", "🦆", "🦅", "🦉", "🦇", "🐺",
            "🐗", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞", "🐜", "🦗", "🐢", "🐍",
            "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬",
            "🐳", "🐋", "🦈", "🌵", "🎄", "🌲", "🌳", "🌴", "🌱", "🌿", "☘️", "🍀",
        ),
    ),
    EmojiCategory(
        "Food",
        listOf(
            "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍈", "🍒", "🍑",
            "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🥦", "🥕", "🌽", "🌶️", "🥒", "🥬",
            "🧄", "🧅", "🍄", "🥜", "🍞", "🥐", "🥖", "🥨", "🧀", "🥚", "🍳", "🥞",
            "🧇", "🥓", "🍔", "🍟", "🍕", "🌭", "🥪", "🌮", "🌯", "🥙", "🍜", "🍝",
            "🍣", "🍱", "🍤", "🍚", "🍦", "🍰", "🎂", "🍫", "🍬", "🍭", "☕", "🧋",
        ),
    ),
    EmojiCategory(
        "Activity",
        listOf(
            "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸", "🏒",
            "🏑", "🥍", "🏏", "🥅", "⛳", "🪁", "🏹", "🎣", "🤿", "🥊", "🥋", "🎽",
            "🛹", "🛼", "🛷", "⛸️", "🥌", "🎿", "⛷️", "🏂", "🪂", "🏋️", "🤼", "🤸",
            "⛹️", "🤺", "🤾", "🏌️", "🏇", "🧘", "🏄", "🏊", "🤽", "🚣", "🧗", "🚵",
            "📱", "💻", "⌚", "📷", "🎧", "🎮", "🕹️", "🎲", "🧩", "🎯", "🎳", "🎨",
        ),
    ),
)

@Composable
private fun EmojiPanel(onPick: (String) -> Unit) {
    var category by remember { mutableStateOf(0) }
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        tonalElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space4),
            ) {
                emojiCategories.forEachIndexed { index, item ->
                    TextButton(onClick = { category = index }) {
                        Text(
                            text = item.label,
                            style = MaterialTheme.typography.labelMedium,
                            color = if (index == category) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                }
            }
            LazyVerticalGrid(
                columns = GridCells.Fixed(8),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp)
                    .padding(horizontal = GagaDimens.space8),
            ) {
                items(emojiCategories[category].emojis) { emoji ->
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .clickable { onPick(emoji) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(text = emoji, fontSize = 22.sp)
                    }
                }
            }
        }
    }
}
