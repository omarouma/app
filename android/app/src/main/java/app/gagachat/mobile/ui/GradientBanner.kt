package app.gagachat.mobile.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import androidx.core.content.ContextCompat
import app.gagachat.mobile.R

/**
 * LINE-style profile banner: a teal→green vertical gradient with a soft wave
 * silhouette across the lower third. Drawn programmatically so no image asset
 * is required and it scales to any width.
 */
object GradientBanner {

    fun banner(ctx: Context): Drawable {
        val top = ContextCompat.getColor(ctx, R.color.line_banner_top)
        val mid = ContextCompat.getColor(ctx, R.color.line_banner_mid)
        val bottom = ContextCompat.getColor(ctx, R.color.line_banner_bottom)
        return object : Drawable() {
            private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            private val wave = Path()

            override fun draw(canvas: Canvas) {
                val w = bounds.width().toFloat()
                val h = bounds.height().toFloat()
                // vertical gradient
                paint.shader = LinearGradient(
                    0f, 0f, 0f, h,
                    intArrayOf(top, mid, bottom),
                    floatArrayOf(0f, 0.55f, 1f),
                    Shader.TileMode.CLAMP
                )
                canvas.drawRect(0f, 0f, w, h, paint)
                // wave silhouette (lighter overlay)
                paint.shader = null
                paint.color = Color.argb(38, 255, 255, 255)
                wave.reset()
                wave.moveTo(0f, h * 0.72f)
                wave.cubicTo(w * 0.25f, h * 0.60f, w * 0.55f, h * 0.86f, w, h * 0.68f)
                wave.lineTo(w, h)
                wave.lineTo(0f, h)
                wave.close()
                canvas.drawPath(wave, paint)
                // second, subtler wave
                paint.color = Color.argb(24, 255, 255, 255)
                wave.reset()
                wave.moveTo(0f, h * 0.84f)
                wave.cubicTo(w * 0.35f, h * 0.74f, w * 0.65f, h * 0.96f, w, h * 0.80f)
                wave.lineTo(w, h)
                wave.lineTo(0f, h)
                wave.close()
                canvas.drawPath(wave, paint)
            }

            override fun setAlpha(alpha: Int) { paint.alpha = alpha }
            override fun setColorFilter(colorFilter: android.graphics.ColorFilter?) {
                paint.colorFilter = colorFilter
            }
            @Deprecated("Deprecated in Java")
            override fun getOpacity(): Int = android.graphics.PixelFormat.OPAQUE
        }
    }

    /** Flat rounded gradient used for the wallet balance card. */
    fun roundedGradient(ctx: Context, radiusDp: Float = 20f): GradientDrawable {
        val top = ContextCompat.getColor(ctx, R.color.line_banner_top)
        val bottom = ContextCompat.getColor(ctx, R.color.line_banner_bottom)
        return GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(top, bottom)
        ).apply { cornerRadius = radiusDp }
    }
}
