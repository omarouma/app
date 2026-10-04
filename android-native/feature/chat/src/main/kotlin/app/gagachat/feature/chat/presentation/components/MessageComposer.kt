package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Audiotrack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.EmojiEmotions
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Poll
import androidx.compose.material.icons.filled.Schedule
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
 * attachment sheet, the field carries emoji + mic affordances, and a schedule
 * (timer) button sits on the far right. Shows a reply quote or an edit banner
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
                        .padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space6),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    // Round "+" affordance that opens the attachment sheet.
                    Box(
                        modifier = Modifier
                            .size(46.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .clickable {
                                // Dismiss the keyboard first so the sheet is not
                                // pushed off-screen; the draft is preserved in
                                // the hoisted state.
                                focusManager.clearFocus()
                                keyboardController?.hide()
                                showAttachSheet = true
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Filled.Add,
                            contentDescription = "Attach",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Spacer(Modifier.width(GagaDimens.space8))
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
                        trailingIcon = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                IconButton(onClick = { showEmojiPanel = !showEmojiPanel }) {
                                    Icon(
                                        Icons.Filled.EmojiEmotions,
                                        contentDescription = "Emoji",
                                        tint = if (showEmojiPanel) {
                                            MaterialTheme.colorScheme.primary
                                        } else {
                                            MaterialTheme.colorScheme.onSurfaceVariant
                                        },
                                    )
                                }
                                if (draft.isBlank() && editingMessage == null) {
                                    IconButton(onClick = onStartRecording) {
                                        Icon(
                                            Icons.Filled.Mic,
                                            contentDescription = "Record voice message",
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        },
                    )
                    Spacer(Modifier.width(GagaDimens.space4))
                    if (draft.isBlank() && editingMessage == null) {
                        // Schedule / timer affordance on the far right.
                        Box(
                            modifier = Modifier
                                .size(46.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .clickable(onClick = onScheduleClick),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Filled.Schedule,
                                contentDescription = "Schedule message",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
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
                onPickContact = { showAttachSheet = false; onPickContact() },
                onShareLocation = { showAttachSheet = false; onShareLocation() },
                onShareLiveLocation = { showAttachSheet = false; onShareLiveLocation() },
                onPickFile = { showAttachSheet = false; onAttach() },
                onSendPoll = { showAttachSheet = false; onSendPoll() },
            )
        }
    }
}

/**
 * Attachment grid (reference screenshot 174602): a four-column grid of green
 * icons on light-green circular tiles — Photos / Camera / Video / Audio file,
 * Contact / Location / Live location / Document, then Poll.
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
) {
    val options = listOf(
        Triple(Icons.Filled.Image, "Photos", onPickImage),
        Triple(Icons.Filled.CameraAlt, "Camera", onTakePhoto),
        Triple(Icons.Filled.Videocam, "Video", onPickVideo),
        Triple(Icons.Filled.Audiotrack, "Audio file", onPickAudio),
        Triple(Icons.Filled.Person, "Contact", onPickContact),
        Triple(Icons.Filled.LocationOn, "Location", onShareLocation),
        Triple(Icons.Filled.NearMe, "Live location", onShareLiveLocation),
        Triple(Icons.Filled.Description, "Document", onPickFile),
        Triple(Icons.Filled.Poll, "Poll", onSendPoll),
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 420.dp)
            // Keep every option reachable on short screens / landscape instead of
            // letting the last row fall off the bottom of the sheet.
            .verticalScroll(rememberScrollState())
            .padding(bottom = GagaDimens.space24),
    ) {
        Text(
            text = "Add attachment",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
        )
        options.chunked(4).forEach { row ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space4),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                row.forEach { (icon, label, onClick) ->
                    AttachOption(icon = icon, label = label, onClick = onClick)
                }
                // Pad the final (partial) row so its items stay aligned to the
                // four-column grid instead of drifting to the centre.
                repeat(4 - row.size) {
                    Spacer(Modifier.width(72.dp))
                }
            }
        }
    }
}

@Composable
private fun AttachOption(icon: ImageVector, label: String, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .width(72.dp)
            .clip(MaterialTheme.shapes.medium)
            .clickable(onClick = onClick)
            .padding(GagaDimens.space4),
    ) {
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(CircleShape)
                .background(GagaGreenContainer),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = label, tint = GagaGreen)
        }
        Spacer(Modifier.size(GagaDimens.space4))
        Text(text = label, style = MaterialTheme.typography.labelSmall, maxLines = 1)
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
