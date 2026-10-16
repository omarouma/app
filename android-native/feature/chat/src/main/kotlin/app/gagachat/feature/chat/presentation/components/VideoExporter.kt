package app.gagachat.feature.chat.presentation.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.StaticOverlaySettings
import androidx.media3.effect.TextureOverlay
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import java.io.File
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

internal data class VideoSourceInfo(val durationMs: Long, val width: Int)

internal fun readVideoInfo(context: Context, source: Uri): VideoSourceInfo {
    val reader = MediaMetadataRetriever()
    try {
        reader.setDataSource(context, source)
        val duration = reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        val rotation = reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
        val widthKey = if (rotation == 90 || rotation == 270)
            MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT else MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH
        val width = reader.extractMetadata(widthKey)?.toIntOrNull() ?: 0
        require(duration > 0 && width > 0) { "Unreadable video" }
        return VideoSourceInfo(duration, width)
    } finally { reader.release() }
}

/** Creates a separate MP4, verifies it, then hands ownership of the file to the caller. */
@androidx.annotation.OptIn(UnstableApi::class)
internal suspend fun exportVideo(context: Context, source: Uri, edits: VideoEdits): File {
    val info = withContext(Dispatchers.IO) { readVideoInfo(context, source) }
    require(edits.isValid(info.durationMs)) { "Invalid clip range" }
    val directory = File(context.cacheDir, "gaga_video_edits").apply { mkdirs() }
    val output = File(directory, "clip_${UUID.randomUUID()}.mp4")
    try {
        withTimeout(300_000L) {
            withContext(Dispatchers.Main.immediate) {
                suspendCancellableCoroutine<Unit> { continuation ->
                    val bitmaps = mutableListOf<Bitmap>()
                    val overlays = mutableListOf<TextureOverlay>()
                    fun addOverlay(text: String, y: Float, sticker: Boolean) {
                        if (text.isBlank()) return
                        val renderWidth = minOf(info.width, 1280)
                        val paint = TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                            color = Color.WHITE
                            textSize = renderWidth * if (sticker) 0.14f else 0.055f
                            setShadowLayer(3f, 0f, 1f, Color.BLACK)
                        }
                        val layout = StaticLayout.Builder.obtain(text, 0, text.length, paint,
                            (renderWidth * 0.88f).toInt().coerceAtLeast(1))
                            .setAlignment(Layout.Alignment.ALIGN_CENTER).setIncludePad(true).build()
                        val bitmap = Bitmap.createBitmap(layout.width, layout.height + 8, Bitmap.Config.ARGB_8888)
                        val canvas = Canvas(bitmap)
                        if (!sticker) canvas.drawColor(0x88000000.toInt())
                        canvas.translate(0f, 4f)
                        layout.draw(canvas)
                        bitmaps += bitmap
                        val scale = info.width.toFloat() / renderWidth
                        overlays += BitmapOverlay.createStaticBitmapOverlay(bitmap,
                            StaticOverlaySettings.Builder().setBackgroundFrameAnchor(0f, y)
                                .setScale(scale, scale).build())
                    }
                    var transformer: Transformer? = null
                    fun releaseBitmaps() { bitmaps.forEach { if (!it.isRecycled) it.recycle() } }
                    try {
                        addOverlay(edits.text, edits.textPosition.anchorY, false)
                        addOverlay(edits.sticker, if (edits.textPosition == VideoOverlayPosition.TOP) -0.65f else 0.65f, true)
                        val item = MediaItem.Builder().setUri(source).setClippingConfiguration(
                            MediaItem.ClippingConfiguration.Builder().setStartPositionMs(edits.startMs)
                                .setEndPositionMs(edits.endMs).build()).build()
                        val edited = EditedMediaItem.Builder(item).setRemoveAudio(edits.muted)
                            .setEffects(Effects(emptyList(), if (overlays.isEmpty()) emptyList()
                                else listOf(OverlayEffect(overlays)))) .build()
                        val exporter = Transformer.Builder(context)
                            .setVideoMimeType(MimeTypes.VIDEO_H264).setAudioMimeType(MimeTypes.AUDIO_AAC)
                            .addListener(object : Transformer.Listener {
                                override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                                    releaseBitmaps()
                                    if (continuation.isActive) continuation.resume(Unit)
                                }
                                override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
                                    releaseBitmaps()
                                    if (continuation.isActive) continuation.resumeWithException(exportException)
                                }
                            }).build()
                        transformer = exporter
                        continuation.invokeOnCancellation {
                            val cancel = Runnable {
                                exporter.cancel()
                                releaseBitmaps()
                                output.delete()
                            }
                            if (Looper.myLooper() == Looper.getMainLooper()) cancel.run()
                            else Handler(Looper.getMainLooper()).post(cancel)
                        }
                        exporter.start(edited, output.absolutePath)
                    } catch (failure: Exception) {
                        transformer?.cancel()
                        releaseBitmaps()
                        if (continuation.isActive) continuation.resumeWithException(failure)
                    }
                }
            }
            withContext(Dispatchers.IO) { verifyVideoExport(context, output, edits) }
        }
        return output
    } catch (failure: Throwable) {
        output.delete()
        throw failure
    }
}

internal fun verifyVideoExport(context: Context, output: File, edits: VideoEdits) {
    check(output.length() > 0) { "Empty export" }
    val info = readVideoInfo(context, Uri.fromFile(output))
    check(kotlin.math.abs(info.durationMs - (edits.endMs - edits.startMs)) <= 1000L) { "Unexpected export duration" }
    val extractor = MediaExtractor()
    try {
        extractor.setDataSource(output.absolutePath)
        val types = (0 until extractor.trackCount).map {
            extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME).orEmpty()
        }
        check(types.any { it.startsWith("video/") }) { "Missing video track" }
        check(!edits.muted || types.none { it.startsWith("audio/") }) { "Audio was not removed" }
    } finally { extractor.release() }
    val reader = MediaMetadataRetriever()
    try {
        reader.setDataSource(output.absolutePath)
        val frame = reader.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
        check(frame != null) { "Export cannot be decoded" }
        frame.recycle()
    } finally { reader.release() }
}
