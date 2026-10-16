package app.gagachat.feature.chat.presentation.components

import android.location.Address
import android.location.Geocoder
import android.location.Location
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.gagachat.feature.chat.presentation.LocationPreview
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal data class PlaceResult(val title: String, val address: String, val latitude: Double, val longitude: Double)

internal fun Address.toPlaceResult(): PlaceResult? {
    if (!hasLatitude() || !hasLongitude() || !latitude.isFinite() || !longitude.isFinite() ||
        latitude !in -85.0511..85.0511 || longitude !in -180.0..180.0) return null
    val address = (0..maxAddressLineIndex).mapNotNull { getAddressLine(it) }.joinToString(", ")
    val title = featureName?.takeIf { it.isNotBlank() } ?: address.takeIf { it.isNotBlank() } ?: "Selected location"
    return PlaceResult(title.take(160), address.take(300), latitude, longitude)
}

/** Explicit result selection: searching never silently changes or sends the pin. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocationPreviewDialog(preview: LocationPreview, onConfirm: (Double, Double, String?) -> Unit, onDismiss: () -> Unit) {
    var latitude by remember(preview) { mutableDoubleStateOf(preview.latitude) }
    var longitude by remember(preview) { mutableDoubleStateOf(preview.longitude) }
    var selected by remember(preview) { mutableStateOf<PlaceResult?>(null) }
    var zoom by remember(preview) { mutableIntStateOf(16) }
    var query by remember { mutableStateOf("") }
    var searching by remember { mutableStateOf(false) }
    var results by remember { mutableStateOf<List<PlaceResult>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var sent by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    fun search(nearby: Boolean) {
        val text = query.trim()
        val searchLat = latitude
        val searchLon = longitude
        searching = true
        error = null
        results = emptyList()
        scope.launch {
            try {
                val found = withContext(Dispatchers.IO) {
                    check(Geocoder.isPresent()) { "No address provider" }
                    val geocoder = Geocoder(context, Locale.getDefault())
                    @Suppress("DEPRECATION")
                    val addresses = if (nearby) geocoder.getFromLocation(searchLat, searchLon, 8) else
                        geocoder.getFromLocationName(text, 8,
                            (searchLat - 0.1).coerceAtLeast(-90.0), (searchLon - 0.1).coerceAtLeast(-180.0),
                            (searchLat + 0.1).coerceAtMost(90.0), (searchLon + 0.1).coerceAtMost(180.0))
                    addresses.orEmpty().mapNotNull { it.toPlaceResult() }
                        .distinctBy { it.latitude to it.longitude }
                        .sortedBy {
                            val distance = FloatArray(1)
                            Location.distanceBetween(searchLat, searchLon, it.latitude, it.longitude, distance)
                            distance[0]
                        }
                }
                results = found
                if (found.isEmpty()) error = "No results found. Search another address or choose a pin on the map."
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { error = "Address search is unavailable. You can still choose a pin on the map." }
            finally { searching = false }
        }
    }
    ModalBottomSheet(onDismissRequest = { if (!sent) onDismiss() },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onDismiss, enabled = !sent) { Text("Cancel") }
                Text("Share location", style = MaterialTheme.typography.titleMedium)
                TextButton(onClick = {
                    if (!sent) {
                        sent = true
                        onConfirm(latitude, longitude, selected?.let {
                            if (it.address.isNotBlank()) "${it.title} · ${it.address}" else it.title
                        })
                    }
                }, enabled = !sent) { Text("Send") }
            }
            GagaTiledMap(latitude, longitude, zoom, onSelected = { lat, lon ->
                latitude = lat; longitude = lon; selected = null
            })
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = {
                    latitude = preview.latitude; longitude = preview.longitude; selected = null
                }) { Text("My position") }
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { zoom = (zoom - 1).coerceAtLeast(3) }) { Icon(Icons.Default.Remove, "Zoom out") }
                IconButton(onClick = { zoom = (zoom + 1).coerceAtMost(18) }) { Icon(Icons.Default.Add, "Zoom in") }
            }
            Text(selected?.title ?: "Selected pin", style = MaterialTheme.typography.titleSmall)
            Text(String.format(Locale.US, "%.5f, %.5f", latitude, longitude), style = MaterialTheme.typography.bodySmall)
            if (latitude == preview.latitude && longitude == preview.longitude) {
                val accuracy = preview.accuracyMeters?.takeIf { it > 0 }?.let { "±${it.toInt()} m" } ?: "unknown accuracy"
                Text("Position: $accuracy · recorded ${maxOf(0L, preview.ageMillis / 1000)}s ago",
                    style = MaterialTheme.typography.bodySmall)
            }
            OutlinedTextField(value = query, onValueChange = { query = it.take(120) },
                label = { Text("Search for a place or address") }, singleLine = true,
                modifier = Modifier.fillMaxWidth(), enabled = !searching)
            Row {
                TextButton(onClick = { search(false) }, enabled = !searching && query.isNotBlank()) { Text("Search") }
                TextButton(onClick = { search(true) }, enabled = !searching) { Text("Nearby addresses") }
            }
            if (searching) LinearProgressIndicator(Modifier.fillMaxWidth())
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            results.forEach { place ->
                Surface(color = if (selected == place) MaterialTheme.colorScheme.secondaryContainer
                    else MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth().clickable {
                        selected = place; latitude = place.latitude; longitude = place.longitude; zoom = 16
                    }) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(place.title, style = MaterialTheme.typography.titleSmall)
                            if (place.address.isNotBlank()) Text(place.address, style = MaterialTheme.typography.bodySmall)
                            val distance = FloatArray(1)
                            Location.distanceBetween(preview.latitude, preview.longitude, place.latitude, place.longitude, distance)
                            Text(if (distance[0] < 1000) "${distance[0].toInt()} m from your position"
                                else String.format(Locale.getDefault(), "%.1f km from your position", distance[0] / 1000),
                                style = MaterialTheme.typography.labelSmall)
                        }
                        if (selected == place) Icon(Icons.Default.Check, "Selected place")
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}
