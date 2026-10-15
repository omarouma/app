package app.gagachat.feature.chat.presentation.components

import android.location.Address
import android.location.Geocoder
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.gagachat.feature.chat.presentation.LocationPreview
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Local geocoder suggestions are not a business-directory API. */
private data class AddressCandidate(val label: String, val detail: String, val lat: Double, val lon: Double)

private fun Address.toCandidate(): AddressCandidate? {
    if (latitude !in -85.0511..85.0511 || longitude !in -180.0..180.0) return null
    val headline = featureName?.takeIf { it.isNotBlank() }
        ?: thoroughfare?.takeIf { it.isNotBlank() }
        ?: locality?.takeIf { it.isNotBlank() }
        ?: getAddressLine(0)?.takeIf { it.isNotBlank() }
        ?: "Location"
    return AddressCandidate(headline, getAddressLine(0).orEmpty(), latitude, longitude)
}

/**
 * WeChat-style in-app location selection with confirmed send.
 * Uses only coarse/fine location already obtained by ChatViewModel, plus the
 * platform geocoder on the IO dispatcher. Empty geocoder results degrade
 * to a manual pin; they never become invented named venues.
 */
@Composable
fun LocationPreviewDialog(
    preview: LocationPreview,
    onConfirm: (Double, Double) -> Unit,
    onDismiss: () -> Unit,
) {
    var latitude by remember(preview) { mutableDoubleStateOf(preview.latitude) }
    var longitude by remember(preview) { mutableDoubleStateOf(preview.longitude) }
    var zoom by remember(preview) { mutableIntStateOf(16) }
    var query by remember { mutableStateOf("") }
    var searchBusy by remember { mutableStateOf(false) }
    var searching by remember { mutableStateOf(false) }
    var candidates by remember { mutableStateOf<List<AddressCandidate>>(emptyList()) }
    var lookupError by remember { mutableStateOf<String?>(null) }
    var pinLabel by remember { mutableStateOf("Selected map pin") }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // Nearby reverse-address suggestions, not unverified commercial venues.
    LaunchedEffect(latitude, longitude) {
        delay(450)
        val selectedLat = latitude
        val selectedLng = longitude
        val found = withContext(Dispatchers.IO) {
            @Suppress("DEPRECATION")
            runCatching {
                Geocoder(context, Locale.getDefault())
                    .getFromLocation(selectedLat, selectedLng, 5)
                    .orEmpty()
                    .mapNotNull { it.toCandidate() }
            }.getOrDefault(emptyList())
        }
        candidates = found.distinctBy { it.label to it.detail }.take(5)
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                modifier = Modifier.fillMaxSize()
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .windowInsetsPadding(WindowInsets.navigationBars),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Text("Send location", style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Button(
                        onClick = { onConfirm(latitude, longitude) },
                        enabled = !searchBusy && latitude.isFinite() && longitude.isFinite(),
                        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp),
                    ) { Text("Send") }
                }
                Box(Modifier.fillMaxWidth().weight(1f)) {
                    GagaTiledMap(
                        latitude = latitude, longitude = longitude, zoom = zoom,
                        onSelected = { lat, lng ->
                            latitude = lat
                            longitude = lng
                            pinLabel = "Selected map pin"
                            lookupError = null
                        },
                        modifier = Modifier.fillMaxSize(),
                    )
                    Column(Modifier.align(Alignment.BottomEnd).padding(12.dp)) {
                        FilledTonalIconButton(onClick = { zoom = (zoom + 1).coerceAtMost(18) }) {
                            Icon(Icons.Default.Add, contentDescription = "Zoom in")
                        }
                        FilledTonalIconButton(onClick = { zoom = (zoom - 1).coerceAtLeast(3) }) {
                            Icon(Icons.Default.Remove, contentDescription = "Zoom out")
                        }
                        FilledTonalIconButton(onClick = {
                            latitude = preview.latitude
                            longitude = preview.longitude
                            pinLabel = "Current location"
                        }) {
                            Icon(Icons.Default.MyLocation, contentDescription = "My location")
                        }
                    }
                }
                Surface(tonalElevation = 3.dp, shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)) {
                    Column(
                        modifier = Modifier.fillMaxWidth().heightIn(max = 335.dp)
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(5.dp),
                    ) {
                        OutlinedTextField(
                            value = query,
                            onValueChange = { query = it.take(160) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                            placeholder = { Text("Search for location") },
                            trailingIcon = {
                                TextButton(
                                    enabled = query.isNotBlank() && !searchBusy,
                                    onClick = {
                                        searchBusy = true
                                        lookupError = null
                                        val requested = query.trim()
                                        scope.launch {
                                            val matches = withContext(Dispatchers.IO) {
                                                @Suppress("DEPRECATION")
                                                runCatching {
                                                    Geocoder(context, Locale.getDefault())
                                                        .getFromLocationName(requested, 8)
                                                        .orEmpty().mapNotNull { it.toCandidate() }
                                                }.getOrDefault(emptyList())
                                            }
                                            searchBusy = false
                                            if (matches.isEmpty()) {
                                                lookupError = "No matching address. Tap the map to select a pin."
                                            } else {
                                                candidates = matches.distinctBy { it.label to it.detail }
                                                latitude = candidates.first().lat
                                                longitude = candidates.first().lon
                                                pinLabel = candidates.first().label
                                                // Reverse results may update automatically on map changes.
                                            }
                                        }
                                    },
                                ) { Text("Find") }
                            },
                        )
                        if (searchBusy) LinearProgressIndicator(Modifier.fillMaxWidth())
                        lookupError?.let {
                            Text(it, color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall)
                        }
                        Text("Select a place or send the map pin",
                            fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleSmall)
                        LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 205.dp)) {
                            item {
                                Row(
                                    modifier = Modifier.fillMaxWidth().clickable {
                                        pinLabel = "Selected map pin"
                                    }.padding(vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(Icons.Default.LocationOn, contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary)
                                    Spacer(Modifier.width(12.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(pinLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text(String.format(Locale.US,"%.5f, %.5f", latitude, longitude),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                            items(candidates, key = { "${it.lat}:${it.lon}:${it.label}" }) { place ->
                                Row(
                                    modifier = Modifier.fillMaxWidth().clickable {
                                        latitude = place.lat
                                        longitude = place.lon
                                        pinLabel = place.label
                                        lookupError = null
                                    }.padding(vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Spacer(Modifier.width(36.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(place.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text(place.detail, style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 2, overflow = TextOverflow.Ellipsis)
                                    }
                                }
                            }
                        }
                        Text("Location is sent only after you tap Send.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}
