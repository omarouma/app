package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Explicit privacy boundary for device contacts: picking one never sends it.
 * Review the name, optional phone number and intended disclosure before send.
 * The original address book is not modified.
 */
@Composable
fun ContactShareReviewDialog(
    contact: PickedContact,
    onCancel: () -> Unit,
    onConfirm: (name: String, phone: String?) -> Unit,
) {
    var name by remember(contact) { mutableStateOf(contact.name.take(120)) }
    var includePhone by remember(contact) { mutableStateOf(false) }
    val phone = contact.phone?.takeIf { it.isNotBlank() }
    AlertDialog(
        onDismissRequest = onCancel,
        icon = { Icon(Icons.Default.Person, contentDescription = null) },
        title = { Text("Share contact card") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "Preview the details before sharing in this chat.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(120) },
                    label = { Text("Display name") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                if (phone != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = includePhone,
                            onCheckedChange = { includePhone = it },
                        )
                        Column(modifier = Modifier.padding(start = 4.dp)) {
                            Text("Include phone number", fontWeight = FontWeight.Medium)
                            Text(phone, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                Text(
                    "Only the selected details will be sent to chat participants.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = name.isNotBlank(),
                onClick = { onConfirm(name.trim(), phone.takeIf { includePhone }) },
            ) { Text("Send card") }
        },
        dismissButton = { TextButton(onClick = onCancel) { Text("Cancel") } },
    )
}
