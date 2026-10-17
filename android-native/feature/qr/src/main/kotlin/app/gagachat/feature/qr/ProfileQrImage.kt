package app.gagachat.feature.qr

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.core.content.FileProvider
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.OutputStream

/** A plain, high-contrast QR PNG. No storage permission or remote image service. */
internal object ProfileQrImage {
    fun write(payload: String, stream: OutputStream) {
        require(QrPayload.decodeUserId(payload) != null)
        val matrix = QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, 1024, 1024,
            mapOf(EncodeHintType.MARGIN to 4, EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M))
        val pixels = IntArray(matrix.width * matrix.height) { index ->
            if (matrix[index % matrix.width, index / matrix.width]) android.graphics.Color.BLACK else android.graphics.Color.WHITE
        }
        val bitmap = Bitmap.createBitmap(pixels, matrix.width, matrix.height, Bitmap.Config.ARGB_8888)
        try { check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) }
        finally { bitmap.recycle() }
    }

    suspend fun shareUri(context: Context, payload: String): Uri = withContext(Dispatchers.IO) {
        val directory = File(context.cacheDir, "profile_qr").apply { mkdirs() }
        // Fixed-size cache: replace the previous exported identity on each share.
        val file = File(directory, "gaga-profile.png")
        file.outputStream().use { write(payload, it) }
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    }
}
