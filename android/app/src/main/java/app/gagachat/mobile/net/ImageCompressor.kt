package app.gagachat.mobile.net

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
import app.gagachat.mobile.GaGaApp
import java.io.File
import java.io.FileOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * m-08/M-07: image decode + EXIF rotation + downscale + JPEG re-encode.
 * Keeps uploads under ~1MB while preserving visual quality.
 */
object ImageCompressor {

    fun compress(file: File, maxDim: Int = 2048, quality: Int = 85): File {
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, opts)
        var sample = 1
        var (w, h) = intArrayOf(opts.outWidth, opts.outHeight)
        while (max(w, h) / (sample * 2) >= maxDim) sample *= 2
        val decodeOpts = BitmapFactory.Options().apply { inSampleSize = sample }
        var bmp = BitmapFactory.decodeFile(file.absolutePath, decodeOpts)
            ?: return file

        // EXIF rotation
        runCatching {
            val exif = ExifInterface(file.absolutePath)
            val rotation = when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
            if (rotation != 0f) {
                val m = Matrix().apply { postRotate(rotation) }
                bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
            }
        }

        // Downscale if still huge
        val longest = max(bmp.width, bmp.height)
        if (longest > maxDim) {
            val scale = maxDim.toFloat() / longest
            bmp = Bitmap.createScaledBitmap(bmp, (bmp.width * scale).roundToInt(), (bmp.height * scale).roundToInt(), true)
        }

        val out = File.createTempFile("gaga_img_", ".jpg", file.parentFile ?: GaGaApp.ctx().cacheDir)
        FileOutputStream(out).use { fos ->
            bmp.compress(Bitmap.CompressFormat.JPEG, quality, fos)
        }
        if (out.length() in 1..file.length()) {
            file.delete()
            return out
        }
        out.delete()
        return file
    }
}
