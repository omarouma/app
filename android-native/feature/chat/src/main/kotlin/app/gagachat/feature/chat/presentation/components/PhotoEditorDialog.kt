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
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import java.io.File
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Uses the same renderer for the preview and exported photo. */
@Composable
fun PhotoEditorDialog(uri: Uri, onSave: (Uri) -> Unit, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var history by remember(uri) { mutableStateOf(PhotoEditHistory()) }
    val edits = history.current
    var textDraft by remember(uri) { mutableStateOf("") }
    var tool by remember { mutableStateOf("View") }
    var penColor by remember { mutableIntStateOf(android.graphics.Color.RED) }
    var points by remember { mutableStateOf<List<PhotoPoint>>(emptyList()) }
    var preview by remember(uri) { mutableStateOf<Bitmap?>(null) }
    var rendering by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(edits.text) { textDraft = edits.text }
    LaunchedEffect(uri, edits) {
        rendering = true
        error = null
        try {
            preview = withContext(Dispatchers.IO) {
                renderEditedPhoto(context, uri, edits.rotation, edits.flipped, edits.crop, edits.text, edits.sticker, edits.strokes)
            }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { error = "Could not preview this photo. Undo the last edit or choose another photo." }
        finally { rendering = false }
    }
    fun change(next: PhotoEdits) { history = history.change(next) }
    Dialog(onDismissRequest = { if (!busy) onDismiss() }) {
        Surface(shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Edit photo", style = MaterialTheme.typography.titleLarge)
                Row {
                    TextButton(onClick = { history = history.undo() }, enabled = !busy && history.past.isNotEmpty()) { Text("Undo") }
                    TextButton(onClick = { history = history.redo() }, enabled = !busy && history.future.isNotEmpty()) { Text("Redo") }
                    TextButton(onClick = { change(PhotoEdits()); textDraft = "" }, enabled = !busy) { Text("Reset") }
                }
                preview?.let { bitmap ->
                    Box(Modifier.fillMaxWidth().aspectRatio(bitmap.width.toFloat() / bitmap.height)
                        .background(Color.Black)) {
                        Image(bitmap.asImageBitmap(), "Edited photo preview", modifier = Modifier.fillMaxSize())
                        Canvas(Modifier.fillMaxSize().pointerInput(tool, penColor, bitmap, busy, rendering) {
                            if (tool != "View" && !busy && !rendering) {
                                detectDragGestures(
                                    onDragStart = { point ->
                                        points = listOf(PhotoPoint((point.x / size.width).coerceIn(0f, 1f), (point.y / size.height).coerceIn(0f, 1f)))
                                    },
                                    onDrag = { change, _ ->
                                        change.consume()
                                        if (points.size < 2000) points = points + PhotoPoint(
                                            (change.position.x / size.width).coerceIn(0f, 1f), (change.position.y / size.height).coerceIn(0f, 1f))
                                    },
                                    onDragEnd = {
                                        if (points.size > 1 && edits.strokes.size < 100) change(edits.copy(
                                            strokes = edits.strokes + PhotoStroke(points, penColor, tool == "Mosaic")))
                                        points = emptyList()
                                    }, onDragCancel = { points = emptyList() },
                                )
                            }
                        }) {
                            points.zipWithNext().forEach { (a, b) ->
                                drawLine(if (tool == "Mosaic") Color.Gray else Color(penColor),
                                    Offset(a.x * size.width, a.y * size.height), Offset(b.x * size.width, b.y * size.height),
                                    strokeWidth = min(size.width, size.height) * if (tool == "Mosaic") 0.09f else 0.016f,
                                    cap = StrokeCap.Round)
                            }
                        }
                    }
                }
                if (rendering) LinearProgressIndicator(Modifier.fillMaxWidth())
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("View", "Draw", "Mosaic").forEach { mode ->
                        FilterChip(selected = tool == mode, onClick = { tool = mode }, label = { Text(mode) }, enabled = !busy)
                    }
                }
                if (tool == "Draw") Row(Modifier.horizontalScroll(rememberScrollState())) {
                    listOf("Red" to android.graphics.Color.RED, "Blue" to android.graphics.Color.BLUE,
                        "White" to android.graphics.Color.WHITE, "Black" to android.graphics.Color.BLACK).forEach { (label, color) ->
                        FilterChip(selected = penColor == color, onClick = { penColor = color }, label = { Text(label) })
                    }
                }
                if (tool != "View") Text("Drag on the photo. Lift your finger to apply. Choose View to scroll.", style = MaterialTheme.typography.bodySmall)
                Row {
                    TextButton(onClick = { change(edits.copy(rotation = (edits.rotation + 90) % 360)) }, enabled = !busy) { Text("Rotate") }
                    TextButton(onClick = { change(edits.copy(flipped = !edits.flipped)) }, enabled = !busy) { Text("Flip") }
                }
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    PhotoCrop.entries.forEach { mode ->
                        FilterChip(selected = edits.crop == mode, onClick = { change(edits.copy(crop = mode)) }, label = { Text(mode.label) }, enabled = !busy)
                    }
                }
                OutlinedTextField(value = textDraft, onValueChange = { textDraft = it.take(80) },
                    label = { Text("Text on photo") }, maxLines = 2, enabled = !busy, modifier = Modifier.fillMaxWidth())
                TextButton(onClick = { change(edits.copy(text = textDraft)) }, enabled = !busy && textDraft != edits.text) { Text("Apply text") }
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    listOf("", "❤️", "⭐", "🎉", "😊", "👍").forEach { sticker ->
                        FilterChip(selected = edits.sticker == sticker, onClick = { change(edits.copy(sticker = sticker)) },
                            label = { Text(sticker.ifEmpty { "No sticker" }) }, enabled = !busy)
                    }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") }
                    Button(onClick = {
                        busy = true
                        scope.launch {
                            try {
                                val result = withContext(Dispatchers.IO) {
                                    writeEditedPhoto(context, uri, edits.rotation, edits.flipped, edits.crop, edits.text, edits.sticker, edits.strokes)
                                }
                                onSave(result)
                            } catch (cancelled: CancellationException) { throw cancelled }
                            catch (_: Exception) { error = "Could not save these edits. Please try again." }
                            finally { busy = false }
                        }
                    }, enabled = !busy && !rendering && preview != null && error == null && textDraft == edits.text) {
                        Text(if (busy) "Saving…" else "Done")
                    }
                }
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

internal fun renderEditedPhoto(
    context: Context,
    uri: Uri,
    rotation: Int,
    flipped: Boolean,
    crop: PhotoCrop,
    annotation: String,
    sticker: String = "",
    strokes: List<PhotoStroke> = emptyList(),
): Bitmap {
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
        if (strokes.isNotEmpty() || sticker.isNotBlank()) {
            val writable = bitmap.copy(Bitmap.Config.ARGB_8888, true)
            if (writable !== bitmap) bitmap.recycle()
            bitmap = writable
            drawPhotoMarks(bitmap, strokes, sticker)
        }
        if (annotation.isNotBlank()) {
            val writable = bitmap.copy(Bitmap.Config.ARGB_8888, true)
            if (writable !== bitmap) bitmap.recycle()
            bitmap = writable
            val canvas = AndroidCanvas(bitmap)
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
                text.take(24) + "…" else text
            canvas.drawText(rendered, 15f, bitmap.height - 22f, paint)
        }
        return bitmap
    } catch (failure: Throwable) {
        if (!bitmap.isRecycled) bitmap.recycle()
        throw failure
    }
}

internal fun writeEditedPhoto(
    context: Context, uri: Uri, rotation: Int, flipped: Boolean, crop: PhotoCrop,
    annotation: String, sticker: String = "", strokes: List<PhotoStroke> = emptyList(),
): Uri {
    val bitmap = renderEditedPhoto(context, uri, rotation, flipped, crop, annotation, sticker, strokes)
    val dir = File(context.cacheDir, "gaga_photo_edits").apply { mkdirs() }
    val output = File(dir, "edited_${UUID.randomUUID()}.jpg")
    try {
        output.outputStream().use { stream ->
            check(bitmap.compress(Bitmap.CompressFormat.JPEG, 88, stream)) { "Could not write image" }
        }
        check(output.length() > 0L) { "Empty edited image" }
        return Uri.fromFile(output)
    } catch (failure: Throwable) {
        output.delete()
        throw failure
    } finally { bitmap.recycle() }
}

internal fun drawPhotoMarks(bitmap: Bitmap, strokes: List<PhotoStroke>, sticker: String) {
    val canvas = AndroidCanvas(bitmap)
    for (stroke in strokes) {
        if (stroke.points.isEmpty()) continue
        val path = android.graphics.Path()
        stroke.points.forEachIndexed { index, point ->
            val x = point.x.coerceIn(0f, 1f) * bitmap.width
            val y = point.y.coerceIn(0f, 1f) * bitmap.height
            if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = stroke.color
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            strokeWidth = min(bitmap.width, bitmap.height) * if (stroke.mosaic) 0.09f else 0.016f
        }
        if (stroke.mosaic) {
            val tiny = Bitmap.createScaledBitmap(bitmap, max(1, bitmap.width / 24), max(1, bitmap.height / 24), false)
            val pixels = Bitmap.createScaledBitmap(tiny, bitmap.width, bitmap.height, false)
            val clip = android.graphics.Path()
            paint.getFillPath(path, clip)
            canvas.save()
            canvas.clipPath(clip)
            canvas.drawBitmap(pixels, 0f, 0f, Paint().apply { isFilterBitmap = false })
            canvas.restore()
            if (pixels !== bitmap) pixels.recycle()
            if (tiny !== pixels && tiny !== bitmap) tiny.recycle()
        } else canvas.drawPath(path, paint)
    }
    if (sticker.isNotBlank()) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = min(bitmap.width, bitmap.height) * 0.18f
            color = android.graphics.Color.WHITE
            textAlign = Paint.Align.CENTER
        }
        canvas.drawText(sticker, bitmap.width / 2f, paint.textSize * 1.25f, paint)
    }
}
