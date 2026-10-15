package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlin.math.*
import java.util.Locale

/** Coordinate maths for the in-app tile map. Degrees are clamped to Web Mercator. */
internal fun mapWorld(latitude: Double, longitude: Double, zoom: Int): Pair<Double, Double> {
    val z = 2.0.pow(zoom)
    val lat = latitude.coerceIn(-85.0511, 85.0511)
    val y = (1 - ln(tan(Math.toRadians(lat)) + 1.0 / cos(Math.toRadians(lat))) / PI) / 2 * z
    return Pair(((longitude + 180.0) / 360.0 * z), y)
}

internal fun worldCoordinate(x: Double, y: Double, zoom: Int): Pair<Double, Double> {
    val n = 2.0.pow(zoom)
    val lat = Math.toDegrees(atan(sinh(PI * (1 - 2 * y / n))))
    val lon = x / n * 360 - 180
    return Pair(lat.coerceIn(-85.0511, 85.0511),
        ((lon + 540) % 360) - 180)
}

/**
 * Real map tiles inside GaGa, rather than launching another application just
 * to pick a location. Tap the map to choose a new centre; +/- changes zoom.
 * Tile attribution remains visible. The original GPS fix isn't sent until
 * the user explicitly confirms in the parent dialog.
 */
@Composable
fun GagaTiledMap(
    latitude: Double,
    longitude: Double,
    zoom: Int,
    onSelected: ((Double, Double) -> Unit)?,
    modifier: Modifier = Modifier.height(205.dp),
) {
    BoxWithConstraints(
        modifier = modifier.fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(androidx.compose.ui.graphics.Color(0xFFE4EBE6)),
    ) {
        val (centerX, centerY) = mapWorld(latitude, longitude, zoom)
        val left = floor(centerX).toInt()
        val top = floor(centerY).toInt()
        val maxTile = 1 shl zoom
        val visibleWidth = maxWidth
        val visibleHeight = maxHeight
        val density = LocalDensity.current
        val wPx = with(density) { visibleWidth.toPx() }
        val hPx = with(density) { visibleHeight.toPx() }
        val tilePx = with(density) { 256.dp.toPx() }

        for (dy in -1..1) {
            for (dx in -1..1) {
                val tx = left + dx
                val ty = top + dy
                if (ty !in 0 until maxTile) continue
                val wrapped = ((tx % maxTile) + maxTile) % maxTile
                val url = "https://server.arcgisonline.com/ArcGIS/rest/services/" +
                    "World_Street_Map/MapServer/tile/$zoom/$ty/$wrapped"
                AsyncImage(
                    model = url,
                    contentDescription = null,
                    contentScale = ContentScale.FillBounds,
                    modifier = Modifier
                        .offset(
                            x = visibleWidth / 2 + ((tx - centerX) * 256).dp,
                            y = visibleHeight / 2 + ((ty - centerY) * 256).dp,
                        )
                        .size(256.dp),
                )
            }
        }

        Box(Modifier.fillMaxSize().then(
            if (onSelected != null) {
                Modifier.pointerInput(latitude, longitude, zoom, wPx, hPx, tilePx) {
                    detectTapGestures { pos: Offset ->
                        val x = centerX + (pos.x - wPx / 2f) / tilePx
                        val y = centerY + (pos.y - hPx / 2f) / tilePx
                        val (lat, lon) = worldCoordinate(x, y, zoom)
                        onSelected(lat, lon)
                    }
                }
            } else Modifier
        ))
        Icon(
            Icons.Filled.LocationOn,
            contentDescription = "Selected location pin",
            tint = androidx.compose.ui.graphics.Color(0xFFE53935),
            modifier = Modifier.align(Alignment.Center).size(34.dp),
        )
        Text(
            "© Esri · World Street Map",
            style = MaterialTheme.typography.labelSmall,
            color = androidx.compose.ui.graphics.Color.White,
            modifier = Modifier.align(Alignment.BottomEnd)
                .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.65f))
                .padding(horizontal = 5.dp, vertical = 2.dp),
        )
    }
}

@Composable
fun LocationMapViewerDialog(
    title: String,
    latitude: Double,
    longitude: Double,
    onDismiss: () -> Unit,
) {
    var zoom by remember { mutableIntStateOf(16) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                GagaTiledMap(latitude, longitude, zoom, null)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        String.format(Locale.US, "%.5f, %.5f", latitude, longitude),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = { zoom = (zoom - 1).coerceAtLeast(3) }) {
                        Icon(Icons.Default.Remove, contentDescription = "Zoom out")
                    }
                    IconButton(onClick = { zoom = (zoom + 1).coerceAtMost(18) }) {
                        Icon(Icons.Default.Add, contentDescription = "Zoom in")
                    }
                }
                Text("Shared pin · viewable inside GaGa. Directions can still open your preferred navigation app.",
                    style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
    )
}
