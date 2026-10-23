package app.gagachat.core.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance

/** WCAG relative luminance ratio, including translucent foreground paint. */
fun contrastRatio(foreground: Color, background: Color): Double {
    val surface = background.compositeOver(Color.White)
    val painted = foreground.compositeOver(surface)
    val a = painted.luminance().toDouble()
    val b = surface.luminance().toDouble()
    return (maxOf(a, b) + 0.05) / (minOf(a, b) + 0.05)
}

/** Preserve the accent's hue where possible while making it readable on its actual surface. */
fun readableAccent(color: Color, background: Color, minimum: Double = 4.5): Color {
    require(minimum in 1.0..21.0)
    val surface = background.compositeOver(Color.White)
    val start = color.compositeOver(surface)
    if (contrastRatio(start, surface) >= minimum) return start
    val target = if (contrastRatio(Color.White, surface) > contrastRatio(Color.Black, surface)) Color.White else Color.Black
    if (contrastRatio(target, surface) < minimum) return target
    var low = 0f
    var high = 1f
    repeat(24) {
        val middle = (low + high) / 2f
        if (contrastRatio(lerp(start, target, middle), surface) >= minimum) high = middle else low = middle
    }
    return lerp(start, target, high)
}
