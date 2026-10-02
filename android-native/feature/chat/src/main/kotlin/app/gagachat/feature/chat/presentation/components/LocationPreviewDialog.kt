package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.gagachat.feature.chat.presentation.LocationPreview
import java.util.Locale

/**
 * F21: confirmation sheet shown before a location is shared. Surfaces the fix's
 * age and accuracy so the user can judge whether it is fresh/reliable enough to
 * send, and requires an explicit tap before anything leaves the device.
 */
@Composable
fun LocationPreviewDialog(
    preview: LocationPreview,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                Icons.Filled.LocationOn,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
        },
        title = { Text("Share this location?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = String.format(
                        Locale.US,
                        "%.5f, %.5f",
                        preview.latitude,
                        preview.longitude,
                    ),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = accuracyLabel(preview.accuracyMeters),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = ageLabel(preview.ageMillis),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                preview.provider?.let { provider ->
                    Text(
                        text = "Source: ${provider.replaceFirstChar { it.uppercase() }}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.size(2.dp))
                Text(
                    text = "Your contacts will be able to open this pin on a map.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text("Send") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

private fun accuracyLabel(accuracyMeters: Float?): String {
    if (accuracyMeters == null || accuracyMeters <= 0f) return "Accuracy: unknown"
    return if (accuracyMeters < 1000f) {
        String.format(Locale.US, "Accuracy: \u00b1%.0f m", accuracyMeters)
    } else {
        String.format(Locale.US, "Accuracy: \u00b1%.1f km", accuracyMeters / 1000f)
    }
}

private fun ageLabel(ageMillis: Long): String {
    val seconds = ageMillis / 1000
    return when {
        seconds < 5 -> "Updated just now"
        seconds < 60 -> "Updated ${seconds}s ago"
        seconds < 3600 -> "Updated ${seconds / 60} min ago"
        seconds < 86_400 -> "Updated ${seconds / 3600} h ago"
        else -> "Updated ${seconds / 86_400} d ago"
    }
}
