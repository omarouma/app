package app.gagachat.feature.contacts.presentation

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.gagachat.core.model.User
import app.gagachat.core.ui.component.GagaAvatar

/**
 * WeChat-style personal contact remark form.
 * These fields never update the other person's public profile or contacts.
 */
@Composable
fun ContactRemarkDialog(
    contact: User,
    initial: PrivateContactRemark,
    saving: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSave: (alias: String, mobile: String, tags: List<String>, remark: String) -> Unit,
) {
    var alias by remember(contact.id, initial) { mutableStateOf(initial.alias) }
    var mobile by remember(contact.id, initial) { mutableStateOf(initial.mobile) }
    var tags by remember(contact.id, initial) { mutableStateOf(initial.tags.joinToString(", ")) }
    var remark by remember(contact.id, initial) { mutableStateOf(initial.remark) }
    Dialog(onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
            Column(
                modifier = Modifier.fillMaxSize()
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .windowInsetsPadding(WindowInsets.navigationBars),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancel") }
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = {
                        onSave(
                            alias, mobile,
                            tags.split(",").map { it.trim() }.filter { it.isNotBlank() }.take(16),
                            remark,
                        )
                    }, enabled = !saving) { Text(if (saving) "Saving…" else "Done") }
                }
                Column(
                    Modifier.fillMaxWidth().weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 22.dp, vertical = 20.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Text("Set remarks", style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold)
                    Row(verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        GagaAvatar(imageUrl = contact.avatar, name = contact.displayLabel)
                        Column {
                            Text(contact.displayLabel, fontWeight = FontWeight.SemiBold)
                            Text("Only you can see these details",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    OutlinedTextField(
                        value = alias, onValueChange = { alias = it.take(64) },
                        label = { Text("Alias") },
                        placeholder = { Text("New alias") },
                        singleLine = true, modifier = Modifier.fillMaxWidth(), enabled = !saving,
                    )
                    OutlinedTextField(
                        value = mobile, onValueChange = { mobile = it.take(40) },
                        label = { Text("Mobile (private)") },
                        placeholder = { Text("Add mobile number") },
                        singleLine = true, modifier = Modifier.fillMaxWidth(), enabled = !saving,
                    )
                    OutlinedTextField(
                        value = tags, onValueChange = { tags = it.take(560) },
                        label = { Text("Tags") },
                        placeholder = { Text("Class, Work, Family") },
                        supportingText = { Text("Separate tags with commas · up to 16") },
                        modifier = Modifier.fillMaxWidth(), enabled = !saving,
                    )
                    OutlinedTextField(
                        value = remark, onValueChange = { remark = it.take(1200) },
                        label = { Text("Private remark") },
                        placeholder = { Text("Write a note for yourself") },
                        minLines = 3, maxLines = 6,
                        modifier = Modifier.fillMaxWidth(), enabled = !saving,
                    )
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    Text(
                        "Private contact notes sync securely to your GaGa account. " +
                        "Contact photos and per-contact photo overrides require a separate storage-permission step.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
