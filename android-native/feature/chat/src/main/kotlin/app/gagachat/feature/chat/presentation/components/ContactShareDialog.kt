package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Nothing leaves the device until the contact and recipient are confirmed. */
@Composable
internal fun ContactShareDialog(
    contact: PickedContact,
    recipient: String,
    onDismiss: () -> Unit,
    onSend: (String) -> Unit,
) {
    var note by remember(contact) { mutableStateOf("") }
    var sent by remember(contact) { mutableStateOf(false) }
    AlertDialog(onDismissRequest = { if (!sent) onDismiss() }, title = { Text("Send contact card") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Send to: $recipient", style = MaterialTheme.typography.titleSmall)
                Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = MaterialTheme.shapes.medium) {
                    Column(Modifier.fillMaxWidth().padding(14.dp)) {
                        Text(contact.name, style = MaterialTheme.typography.titleMedium)
                        contact.phone?.let { Text(it) }
                        Text("Contact card", style = MaterialTheme.typography.labelSmall)
                    }
                }
                OutlinedTextField(value = note, onValueChange = { note = it.take(1000) },
                    label = { Text("Add a message (optional)") }, maxLines = 3, enabled = !sent)
            }
        },
        confirmButton = {
            TextButton(onClick = { if (!sent) { sent = true; onSend(note.trim()) } }, enabled = !sent) { Text("Send") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !sent) { Text("Cancel") } })
}
