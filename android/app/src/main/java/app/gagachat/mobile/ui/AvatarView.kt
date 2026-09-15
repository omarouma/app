package app.gagachat.mobile.ui

import android.content.Context
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import androidx.appcompat.widget.AppCompatImageView
import coil.load
import java.security.MessageDigest

/**
 * FIX M-05-adjacent: avatar view with deterministic initial-fallback.
 * Never throws on missing avatar_url — renders initials on a stable hue.
 */
class AvatarView @JvmOverloads constructor(
    ctx: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : AppCompatImageView(ctx, attrs, defStyleAttr) {

    private val palettes = intArrayOf(
        0xFF4F6DF5.toInt(), 0xFF7C4FF5.toInt(), 0xFF4FC3F7.toInt(),
        0xFF26A69A.toInt(), 0xFFEF5350.toInt(), 0xFFFF7043.toInt(),
        0xFFAB47BC.toInt(), 0xFFEC407A.toInt(), 0xFF5C6BC0.toInt(),
        0xFF66BB6A.toInt(), 0xFF29B6F6.toInt(), 0xFF8D6E63.toInt()
    )

    fun bind(name: String?, avatarUrl: String?, sizeDp: Int = 40) {
        val label = (name ?: "?").trim().ifBlank { "?" }
        val url = avatarUrl?.takeIf { it.isNotBlank() }
        if (url != null) {
            val base = app.gagachat.mobile.net.Api.baseUrl
            val full = if (url.startsWith("http")) url else base + url
            load(full) {
                placeholder(initialsDrawable(label, sizeDp))
                error(initialsDrawable(label, sizeDp))
            }
        } else {
            setImageResource(0) // clear
            setImageDrawable(initialsDrawable(label, sizeDp))
        }
    }

    private fun initialsDrawable(label: String, sizeDp: Int): android.graphics.drawable.Drawable {
        val px = (sizeDp * resources.displayMetrics.density).toInt().coerceAtLeast(24)
        val initials = label.split(" ")
            .mapNotNull { it.firstOrNull() }
            .take(2)
            .joinToString("") { it.uppercaseChar().toString() }
            .ifBlank { "?" }
        val color = palettes[kotlin.math.abs(hash(label) % palettes.size)]
        val paint = android.graphics.Paint(Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG).apply {
            this.color = color
            style = android.graphics.Paint.Style.FILL
        }
        val textPaint = android.graphics.Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = Color.WHITE
            textSize = px * 0.42f
            textAlign = android.graphics.Paint.Align.CENTER
            typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
            isFakeBoldText = true
        }
        val d = object : android.graphics.drawable.Drawable() {
            override fun draw(canvas: android.graphics.Canvas) {
                val r = canvas.clipBounds
                canvas.drawCircle(r.exactCenterX(), r.exactCenterY(), r.width() / 2f, paint)
                val y = r.exactCenterY() - (textPaint.ascent() + textPaint.descent()) / 2f
                canvas.drawText(initials, r.exactCenterX(), y, textPaint)
            }
            override fun setAlpha(alpha: Int) { paint.alpha = alpha; textPaint.alpha = alpha }
            override fun setColorFilter(cf: android.graphics.ColorFilter?) {
                paint.colorFilter = cf; textPaint.colorFilter = cf
            }
            @Deprecated("Deprecated in Java")
            override fun getOpacity(): Int = android.graphics.PixelFormat.TRANSLUCENT
        }
        d.setBounds(0, 0, px, px)
        return d
    }

    private fun hash(s: String): Int {
        val md = MessageDigest.getInstance("MD5")
        val b = md.digest(s.toByteArray())
        return ((b[0].toInt() and 0xFF) shl 24) or ((b[1].toInt() and 0xFF) shl 16) or
            ((b[2].toInt() and 0xFF) shl 8) or (b[3].toInt() and 0xFF)
    }
}
