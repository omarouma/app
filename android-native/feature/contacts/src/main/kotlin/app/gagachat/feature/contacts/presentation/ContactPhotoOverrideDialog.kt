package app.gagachat.feature.contacts.presentation

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PhotoCamera
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
import app.gagachat.core.model.User
import app.gagachat.core.ui.component.GagaAvatar

/**
 * WeChat-style private contact photo override.
 *
 * Lets the signed-in owner pick a local photo to show instead of the contact's
 * public avatar. The chosen image is copied into app-private storage and is
 * visible only to this account on this device; it never changes what the other
 * person or anyone else sees. The override can be removed at any time.
 */
@Composable
fun ContactPhotoOverrideDialog(
    contact: User,
    currentOverrideUrl: String?,
    saving: Boolean,
    onPick: (Uri) -> Unit,
    onClear: () -> Unit,
    onDismiss: () -> Unit,
) {
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            onPick(uri)
            onDismiss()
        }
    }

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text("Contact photo", fontWeight = FontWeight.SemiBold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    GagaAvatar(
                        imageUrl = currentOverrideUrl ?: contact.avatar,
                        name = contact.displayLabel,
                    )
                    Column {
                        Text(contact.displayLabel, fontWeight = FontWeight.SemiBold)
                        Text(
                            "Only you can see this photo",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Text(
                    "Pick a photo to show instead of ${contact.displayLabel}'s public avatar. " +
                        "It stays private to this account on this device and never changes " +
                        "what anyone else sees.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = !saving,
                onClick = {
                    launcher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                    )
                },
            ) {
                Icon(Icons.Filled.PhotoCamera, contentDescription = null)
                Text(
                    text = if (currentOverrideUrl != null) "Change photo" else "Choose photo",
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
        },
        dismissButton = {
            if (currentOverrideUrl != null) {
                TextButton(enabled = !saving, onClick = { onClear(); onDismiss() }) {
                    Icon(Icons.Filled.Delete, contentDescription = null)
                    Text("Remove", modifier = Modifier.padding(start = 6.dp))
                }
            } else {
                TextButton(enabled = !saving, onClick = onDismiss) { Text("Cancel") }
            }
        },
    )
}
