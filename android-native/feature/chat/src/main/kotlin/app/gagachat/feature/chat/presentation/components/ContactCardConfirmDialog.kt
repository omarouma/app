package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * A contact card can expose a third person's phone number.
 * Require explicit consent before making that number visible to chat members.
 * No external action happens until Send is pressed.
 */
@Composable
fun ContactCardConfirmDialog(
    contact: PickedContact,
    onDismiss: () -> Unit,
    onConfirm: (name: String, phone: String?) -> Unit,
) {
    val hasPhone = !contact.phone.isNullOrBlank()
    var sharePhone by remember(contact) { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Share contact card") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Send to this chat", style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Icon(Icons.Default.Person, contentDescription = null, modifier = Modifier.size(36.dp),
                            tint = MaterialTheme.colorScheme.primary)
                        Column(Modifier.weight(1f)) {
                            Text(contact.name, fontWeight = FontWeight.SemiBold)
                            Text(
                                if (hasPhone && sharePhone) contact.phone.orEmpty()
                                else "Contact name only",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                if (hasPhone) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = sharePhone, onCheckedChange = { sharePhone = it })
                        Text("Include phone number", style = MaterialTheme.typography.bodyMedium)
                    }
                    Text("The recipient can save or call this number if you include it.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text("Review this card before sending. It cannot be unsent from a recipient's saved contacts.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = {
            Button(onClick = {
                onConfirm(contact.name, if (sharePhone) contact.phone else null)
            }, enabled = contact.name.isNotBlank()) { Text("Send card") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
