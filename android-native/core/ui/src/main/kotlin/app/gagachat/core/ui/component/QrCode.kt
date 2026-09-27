package app.gagachat.core.ui.component

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

/**
 * Renders a scannable QR code for [content] entirely in Compose (no Android
 * Bitmap required). Uses ZXing's pure-Java encoder and draws each module as a
 * filled rect, so it scales crisply at any size and respects the theme.
 */
@Composable
fun GagaQrCode(
    content: String,
    modifier: Modifier = Modifier,
    size: Dp = 240.dp,
) {
    val matrix = remember(content) {
        runCatching {
            val hints = mapOf(
                EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
                EncodeHintType.MARGIN to 1,
            )
            QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, 512, 512, hints)
        }.getOrNull()
    }

    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White)
            .padding(12.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (matrix == null) {
            androidx.compose.material3.Text(
                text = "Unable to render QR",
                style = MaterialTheme.typography.bodySmall,
                color = Color.Black,
            )
            return@Box
        }
        Canvas(modifier = Modifier.size(size - 24.dp)) {
            val modules = matrix.width
            val cell = this.size.width / modules
            for (x in 0 until modules) {
                for (y in 0 until modules) {
                    if (matrix.get(x, y)) {
                        drawRect(
                            color = Color.Black,
                            topLeft = Offset(x * cell, y * cell),
                            size = Size(cell + 0.5f, cell + 0.5f),
                        )
                    }
                }
            }
        }
    }
}
