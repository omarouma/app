package app.gagachat.feature.chat.presentation.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.automirrored.filled.RotateRight
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Flip
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import coil.compose.AsyncImage
import java.io.File
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Editor tool selected in the annotation toolbar. */
internal enum class EditorTool { NONE, DOODLE, STICKER }

private const val DOODLE_WIDTH_FRACTION = 0.012f
private const val STICKER_SCALE_FRACTION = 0.20f

/** A private, on-device editor: original photos are never overwritten.
 * Edited copies are passed through the existing durable media upload queue.
 */
@Composable
fun PhotoEditorDialog(
    uri: Uri,
    onSave: (Uri) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var rotation by remember(uri) { mutableIntStateOf(0) }
    var flipped by remember(uri) { mutableStateOf(false) }
    var crop by remember(uri) { mutableStateOf(PhotoCrop.ORIGINAL) }
    var overlayText by remember(uri) { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    // Doodle/sticker layer with bounded undo/redo. Kept separate from the
    // rotate/flip/crop controls so a mis-stroke never discards a crop choice.
    var history by remember(uri) { mutableStateOf(AnnotationHistory()) }
    var tool by remember(uri) { mutableStateOf(EditorTool.NONE) }
    var doodleColor by remember(uri) { mutableIntStateOf(PhotoDoodlePalette.first()) }
    var imageAspect by remember(uri) { mutableFloatStateOf(1f) }
    var activeStroke by remember(uri) { mutableStateOf<DoodleStroke?>(null) }

    LaunchedEffect(uri) {
        imageAspect = withContext(Dispatchers.IO) { readImageAspect(context, uri) }
    }

    val annotations = history.current
    val previewAnnotations = activeStroke?.let { annotations.withStroke(it) } ?: annotations
    // Rotating 90/270 swaps the displayed aspect so the annotation layer keeps
    // the same normalized coordinates as the exported bitmap.
    val effectiveAspect = if (rotation % 180 == 90) 1f / imageAspect else imageAspect

    Dialog(onDismissRequest = { if (!busy) onDismiss() }) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                Modifier
                    .padding(16.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Edit photo", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Box(
                    Modifier.fillMaxWidth().heightIn(min = 170.dp, max = 260.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .aspectRatio(effectiveAspect.coerceIn(0.2f, 5f))
                            .clip(RoundedCornerShape(14.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .pointerInput(tool, doodleColor) {
                                if (tool != EditorTool.DOODLE) return@pointerInput
                                detectDragGestures(
                                    onDragStart = { offset ->
                                        activeStroke = DoodleStroke(
                                            points = listOf(
                                                normalizePointer(offset.x, offset.y, size.width, size.height),
                                            ),
                                            colorArgb = doodleColor,
                                            widthFraction = DOODLE_WIDTH_FRACTION,
                                        )
                                    },
                                    onDrag = { change, _ ->
                                        change.consume()
                                        activeStroke = activeStroke?.let { stroke ->
                                            stroke.copy(
                                                points = stroke.points +
                                                    normalizePointer(
                                                        change.position.x,
                                                        change.position.y,
                                                        size.width,
                                                        size.height,
                                                    ),
                                            )
                                        }
                                    },
                                    onDragEnd = {
                                        activeStroke?.takeIf { it.isDrawable }?.let { stroke ->
                                            history = history.change(history.current.withStroke(stroke))
                                        }
                                        activeStroke = null
                                    },
                                    onDragCancel = { activeStroke = null },
                                )
                            },
                    ) {
                        AsyncImage(
                            model = uri,
                            contentDescription = "Photo being edited",
                            contentScale = if (crop == PhotoCrop.ORIGINAL) ContentScale.Fit else ContentScale.Crop,
                            modifier = Modifier.fillMaxSize()
                                .graphicsLayer(rotationZ = rotation.toFloat(), scaleX = if (flipped) -1f else 1f),
                        )
                        Canvas(Modifier.fillMaxSize()) {
                            drawIntoCanvas { canvas ->
                                renderAnnotations(
                                    canvas.nativeCanvas,
                                    size.width.toInt(),
                                    size.height.toInt(),
                                    previewAnnotations,
                                )
                            }
                        }
                        if (overlayText.isNotBlank()) {
                            Text(
                                overlayText.take(80),
                                color = Color.White,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.align(Alignment.BottomCenter)
                                    .padding(8.dp)
                                    .background(Color.Black.copy(alpha = 0.6f))
                                    .padding(6.dp),
                            )
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { rotation = (rotation + 90) % 360 }, enabled = !busy,
                        modifier = Modifier.weight(1f)) {
                        Icon(Icons.AutoMirrored.Filled.RotateRight, null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Rotate")
                    }
                    OutlinedButton(onClick = { flipped = !flipped }, enabled = !busy,
                        modifier = Modifier.weight(1f)) {
                        Icon(Icons.Filled.Flip, null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Flip")
                    }
                }
                Text("Crop", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    PhotoCrop.entries.forEach { mode ->
                        FilterChip(
                            selected = crop == mode,
                            enabled = !busy,
                            onClick = { crop = mode },
                            label = { Text(mode.label, style = MaterialTheme.typography.labelSmall) },
                        )
                    }
                }

                // Doodle / sticker layer controls.
                Row(verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Draw", style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                    FilterChip(
                        selected = tool == EditorTool.DOODLE,
                        enabled = !busy,
                        onClick = { tool = if (tool == EditorTool.DOODLE) EditorTool.NONE else EditorTool.DOODLE },
                        leadingIcon = { Icon(Icons.Filled.Brush, null, modifier = Modifier.size(16.dp)) },
                        label = { Text("Doodle") },
                    )
                    FilterChip(
                        selected = tool == EditorTool.STICKER,
                        enabled = !busy,
                        onClick = { tool = if (tool == EditorTool.STICKER) EditorTool.NONE else EditorTool.STICKER },
                        label = { Text("Sticker") },
                    )
                }
                if (tool == EditorTool.DOODLE) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        PhotoDoodlePalette.forEach { argb ->
                            val selected = doodleColor == argb
                            Box(
                                Modifier.size(26.dp)
                                    .clip(CircleShape)
                                    .background(Color(argb))
                                    .border(
                                        width = if (selected) 3.dp else 1.dp,
                                        color = if (selected) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.outline,
                                        shape = CircleShape,
                                    )
                                    .clickable(enabled = !busy) { doodleColor = argb },
                            )
                        }
                    }
                }
                if (tool == EditorTool.STICKER) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        PhotoStickerPalette.forEach { emoji ->
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                modifier = Modifier.size(38.dp).clickable(enabled = !busy) {
                                    history = history.change(
                                        history.current.withSticker(
                                            StickerPlacement(
                                                emoji = emoji,
                                                anchor = NormPoint(0.5f, 0.5f),
                                                scaleFraction = STICKER_SCALE_FRACTION,
                                            ),
                                        ),
                                    )
                                },
                            ) {
                                Box(contentAlignment = Alignment.Center) { Text(emoji) }
                            }
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { history = history.undo() },
                        enabled = !busy && history.canUndo) {
                        Icon(Icons.AutoMirrored.Filled.Undo, null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Undo")
                    }
                    TextButton(onClick = { history = history.redo() },
                        enabled = !busy && history.canRedo) {
                        Icon(Icons.AutoMirrored.Filled.Redo, null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Redo")
                    }
                    TextButton(onClick = { history = history.change(PhotoAnnotations()) },
                        enabled = !busy && !annotations.isEmpty) {
                        Icon(Icons.Filled.Clear, null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Clear")
                    }
                }

                OutlinedTextField(
                    value = overlayText,
                    onValueChange = { overlayText = it.take(80) },
                    label = { Text("Add text (optional)") },
                    maxLines = 2,
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") }
                    Spacer(Modifier.width(8.dp))
                    Button(onClick = {
                        busy = true
                        error = null
                        scope.launch {
                            val result = withContext(Dispatchers.IO) {
                                runCatching {
                                    writeEditedPhoto(context, uri, rotation, flipped, crop, overlayText, annotations)
                                }
                            }
                            busy = false
                            result.onSuccess(onSave).onFailure {
                                error = "Couldn't edit this image. Try another photo or send the original."
                            }
                        }
                    }, enabled = !busy) {
                        if (busy) CircularProgressIndicator(Modifier.size(16.dp),
                            strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                        else Text("Apply edits")
                    }
                }
                Text("The original is unchanged. Only the edited copy is sent.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

internal enum class PhotoCrop(val label: String, val aspect: Float?) {
    ORIGINAL("Original", null),
    SQUARE("1:1", 1f),
    PORTRAIT("4:5", 4f / 5f),
    LANDSCAPE("16:9", 16f / 9f),
}

/** Reads the decoded aspect ratio (width/height) for the annotation overlay. */
internal fun readImageAspect(context: Context, uri: Uri): Float {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    runCatching {
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    }
    return if (bounds.outWidth > 0 && bounds.outHeight > 0) {
        bounds.outWidth.toFloat() / bounds.outHeight.toFloat()
    } else 1f
}

/** Pure pixel geometry for predictable, centered cropping. */
internal fun centeredCrop(width: Int, height: Int, aspect: Float?): Rect {
    if (aspect == null || width <= 0 || height <= 0) return Rect(0, 0, width, height)
    val w: Int
    val h: Int
    if (width.toFloat() / height > aspect) {
        h = height
        w = min(width, max(1, (height * aspect).toInt()))
    } else {
        w = width
        h = min(height, max(1, (width / aspect).toInt()))
    }
    val left = (width - w) / 2
    val top = (height - h) / 2
    return Rect(left, top, left + w, top + h)
}

internal fun writeEditedPhoto(
    context: Context,
    uri: Uri,
    rotation: Int,
    flipped: Boolean,
    crop: PhotoCrop,
    annotation: String,
    annotations: PhotoAnnotations = PhotoAnnotations(),
): Uri {
    val resolver = context.contentResolver
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    require(bounds.outWidth > 0 && bounds.outHeight > 0) { "Invalid image" }
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / sample > 2048) sample *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    var bitmap = requireNotNull(resolver.openInputStream(uri)?.use {
        BitmapFactory.decodeStream(it, null, options)
    }) { "Could not decode photo" }
    try {
        // BitmapFactory can return raw sensor orientation while Coil previews
        // follow EXIF. Normalize camera EXIF first so exported portrait photos
        // match what the sender saw in the review sheet.
        val exifOrientation = runCatching {
            resolver.openInputStream(uri)?.use { stream ->
                android.media.ExifInterface(stream).getAttributeInt(
                    android.media.ExifInterface.TAG_ORIENTATION,
                    android.media.ExifInterface.ORIENTATION_NORMAL,
                )
            } ?: android.media.ExifInterface.ORIENTATION_NORMAL
        }.getOrDefault(android.media.ExifInterface.ORIENTATION_NORMAL)
        if (rotation % 360 != 0 || flipped ||
            exifOrientation != android.media.ExifInterface.ORIENTATION_NORMAL
        ) {
            val matrix = Matrix().apply {
                when (exifOrientation) {
                    android.media.ExifInterface.ORIENTATION_ROTATE_90 -> postRotate(90f)
                    android.media.ExifInterface.ORIENTATION_ROTATE_180 -> postRotate(180f)
                    android.media.ExifInterface.ORIENTATION_ROTATE_270 -> postRotate(270f)
                    android.media.ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> postScale(-1f, 1f)
                    android.media.ExifInterface.ORIENTATION_FLIP_VERTICAL -> postScale(1f, -1f)
                    android.media.ExifInterface.ORIENTATION_TRANSPOSE -> {
                        postRotate(90f); postScale(-1f, 1f)
                    }
                    android.media.ExifInterface.ORIENTATION_TRANSVERSE -> {
                        postRotate(270f); postScale(-1f, 1f)
                    }
                }
                postRotate((rotation % 360).toFloat())
                if (flipped) postScale(-1f, 1f)
            }
            val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            if (rotated !== bitmap) bitmap.recycle()
            bitmap = rotated
        }
        val rect = centeredCrop(bitmap.width, bitmap.height, crop.aspect)
        if (rect.width() != bitmap.width || rect.height() != bitmap.height) {
            val cropped = Bitmap.createBitmap(bitmap, rect.left, rect.top, rect.width(), rect.height())
            if (cropped !== bitmap) bitmap.recycle()
            bitmap = cropped
        }
        // Composite doodles, stickers and the caption onto a writable copy so
        // the sent image matches the reviewed preview at full resolution.
        if (!annotations.isEmpty || annotation.isNotBlank()) {
            val writable = bitmap.copy(Bitmap.Config.ARGB_8888, true)
            if (writable !== bitmap) bitmap.recycle()
            bitmap = writable
            val canvas = AndroidCanvas(bitmap)
            renderAnnotations(canvas, bitmap.width, bitmap.height, annotations)
            if (annotation.isNotBlank()) {
                val size = (bitmap.width / 19f).coerceIn(22f, 70f)
                val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    textSize = size
                    typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT,
                        android.graphics.Typeface.BOLD)
                    color = android.graphics.Color.WHITE
                    setShadowLayer(3f, 1f, 2f, android.graphics.Color.BLACK)
                }
                val text = annotation.trim().take(80)
                val rendered = if (paint.measureText(text) > bitmap.width - 30)
                    text.take(24) + "\u2026" else text
                canvas.drawText(rendered, 15f, bitmap.height - 22f, paint)
            }
        }
        val dir = File(context.cacheDir, "gaga_photo_edits").apply { mkdirs() }
        val output = File(dir, "edited_${UUID.randomUUID()}.jpg")
        output.outputStream().use { stream ->
            check(bitmap.compress(Bitmap.CompressFormat.JPEG, 88, stream)) { "Could not write image" }
        }
        check(output.length() > 0L) { "Empty edited image" }
        return Uri.fromFile(output)
    } finally {
        if (!bitmap.isRecycled) bitmap.recycle()
    }
}
