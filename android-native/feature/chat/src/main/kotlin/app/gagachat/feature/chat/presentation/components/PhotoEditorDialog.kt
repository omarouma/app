package app.gagachat.feature.chat.presentation.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Flip
import androidx.compose.material.icons.filled.RotateRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
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
                    Modifier.fillMaxWidth().heightIn(min = 170.dp, max = 260.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) {
                    AsyncImage(
                        model = uri,
                        contentDescription = "Photo being edited",
                        contentScale = if (crop == PhotoCrop.ORIGINAL) ContentScale.Fit else ContentScale.Crop,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 170.dp, max = 260.dp)
                            .graphicsLayer(rotationZ = rotation.toFloat(), scaleX = if (flipped) -1f else 1f),
                    )
                    if (overlayText.isNotBlank()) {
                        Text(
                            overlayText.take(80),
                            color = androidx.compose.ui.graphics.Color.White,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.align(Alignment.BottomCenter)
                                .padding(8.dp)
                                .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.6f))
                                .padding(6.dp),
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { rotation = (rotation + 90) % 360 }, enabled = !busy,
                        modifier = Modifier.weight(1f)) {
                        Icon(Icons.Filled.RotateRight, null, modifier = Modifier.size(18.dp))
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
                                runCatching { writeEditedPhoto(context, uri, rotation, flipped, crop, overlayText) }
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
        if (rotation % 360 != 0 || flipped) {
            val matrix = Matrix().apply {
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
