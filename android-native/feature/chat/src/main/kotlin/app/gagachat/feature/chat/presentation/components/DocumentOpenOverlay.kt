package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/**
 * F12: shows a small blocking indicator while a document is downloaded for
 * external viewing, and a dismissible dialog when it cannot be opened.
 */
@Composable
fun DocumentOpenOverlay(
    state: DocumentOpenState,
    onDismiss: () -> Unit,
) {
    when (state) {
        DocumentOpenState.Idle -> Unit
        DocumentOpenState.Loading -> Dialog(
            onDismissRequest = {},
            properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
        ) {
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.surface,
            ) {
                Row(
                    modifier = Modifier.padding(20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.width(14.dp))
                    Text(
                        text = "Preparing document\u2026",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }
        is DocumentOpenState.Error -> AlertDialog(
            onDismissRequest = onDismiss,
            icon = {
                Icon(
                    Icons.Filled.ErrorOutline,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
                )
            },
            title = { Text("Can't open document") },
            text = { Text(state.message) },
            confirmButton = {
                TextButton(onClick = onDismiss) { Text("OK") }
            },
        )
    }
}

/**
 * V3.0 Sprint B (row #6): shows a brief indicator while a document is written to
 * the user-chosen location, then a confirmation or a dismissible error. Pairs
 * with [DocumentSaver] (the "save" half of the guide's "Open/save").
 */
@Composable
fun DocumentSaveOverlay(
    state: DocumentSaveState,
    onDismiss: () -> Unit,
) {
    when (state) {
        DocumentSaveState.Idle -> Unit
        DocumentSaveState.Saving -> Dialog(
            onDismissRequest = {},
            properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
        ) {
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.surface,
            ) {
                Row(
                    modifier = Modifier.padding(20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.width(14.dp))
                    Text(
                        text = "Saving document\u2026",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }
        is DocumentSaveState.Saved -> AlertDialog(
            onDismissRequest = onDismiss,
            icon = {
                Icon(
                    Icons.Filled.CheckCircle,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
            },
            title = { Text("Saved") },
            text = { Text("${state.name} was saved to the location you chose.") },
            confirmButton = {
                TextButton(onClick = onDismiss) { Text("OK") }
            },
        )
        is DocumentSaveState.Error -> AlertDialog(
            onDismissRequest = onDismiss,
            icon = {
                Icon(
                    Icons.Filled.ErrorOutline,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
                )
            },
            title = { Text("Can't save document") },
            text = { Text(state.message) },
            confirmButton = {
                TextButton(onClick = onDismiss) { Text("OK") }
            },
        )
    }
}
