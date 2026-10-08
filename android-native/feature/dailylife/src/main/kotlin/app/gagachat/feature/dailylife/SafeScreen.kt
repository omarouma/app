package app.gagachat.feature.dailylife

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.SafetyCheckIn
import app.gagachat.core.model.SafetyContact
import app.gagachat.core.model.SafetyStatus
import app.gagachat.core.ui.component.GagaScaffold
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val checkInTime = DateTimeFormatter.ofPattern("dd MMM, HH:mm")

private fun dueLabel(value: String): String =
    runCatching { Instant.parse(value).atZone(ZoneId.systemDefault()).format(checkInTime) }.getOrDefault(value)

/** GaGa Safe (Signature Features 2.3): trusted contacts, timed check-ins and SOS. */
@Composable
fun SafeScreen(onBack: () -> Unit, vm: SafeViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    var showAddContact by remember { mutableStateOf(false) }
    var showNewCheckIn by remember { mutableStateOf(false) }
    var showSosConfirm by remember { mutableStateOf(false) }

    GagaScaffold(title = "GaGa Safe", onBack = onBack) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (ui.loading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            ui.error?.let { error ->
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                        Column(Modifier.padding(12.dp)) {
                            Text(error)
                            TextButton(onClick = { vm.clearMessages(); vm.refresh() }) { Text("Retry") }
                        }
                    }
                }
            }
            ui.notice?.let { notice ->
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(notice, Modifier.weight(1f))
                            TextButton(onClick = vm::clearMessages) { Text("OK") }
                        }
                    }
                }
            }

            item {
                Text("Safety at a glance", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Share your status with people you trust. Nothing is sent until you start a check-in or an SOS.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // SOS
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Warning, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Emergency SOS", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        }
                        Text(
                            "Alerts your safety contacts immediately and records an SOS entry in GaGa Safe.",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Button(
                            onClick = { showSosConfirm = true },
                            enabled = !ui.busy,
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Raise SOS") }
                    }
                }
            }

            // Active check-in
            val active = ui.activeCheckIn
            if (active != null) {
                item { ActiveCheckInCard(active, ui.busy, onSafe = { vm.resolve(active, "safe") }, onCancel = { vm.resolve(active, "cancelled") }) }
            } else {
                item {
                    Card {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Check on me", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(
                                "GaGa will remind you before the timer ends. If it expires, your safety contacts are alerted.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            FilledTonalButton(onClick = { showNewCheckIn = true }, enabled = !ui.busy) { Text("Start a check-in") }
                        }
                    }
                }
            }

            // Recent check-ins
            val history = ui.checkIns.filter { it.safetyStatus != SafetyStatus.PENDING }
            if (history.isNotEmpty()) {
                item { Text("Recent", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
                items(history, key = { it.id }) { entry -> CheckInHistoryRow(entry) }
            }

            // Contacts
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Safety contacts", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    IconButton(onClick = { showAddContact = true }, enabled = !ui.busy) {
                        Icon(Icons.Filled.Add, contentDescription = "Add contact")
                    }
                }
            }
            if (ui.contacts.isEmpty()) {
                item {
                    Text(
                        "No contacts yet. Add the people GaGa should alert when a check-in expires.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                items(ui.contacts, key = { it.id }) { contact -> ContactRow(contact, ui.busy) { vm.removeContact(contact) } }
            }
        }
    }

    if (showAddContact) {
        AddContactDialog(
            onDismiss = { showAddContact = false },
            onSave = { name, phone -> vm.addContact(name, phone, null) { showAddContact = false } },
        )
    }
    if (showNewCheckIn) {
        NewCheckInDialog(
            onDismiss = { showNewCheckIn = false },
            onSave = { label, minutes -> vm.createCheckIn(label, minutes) { showNewCheckIn = false } },
        )
    }
    if (showSosConfirm) {
        AlertDialog(
            onDismissRequest = { showSosConfirm = false },
            icon = { Icon(Icons.Filled.Warning, contentDescription = null) },
            title = { Text("Raise SOS?") },
            text = { Text("This immediately alerts your safety contacts and records an SOS entry. Only use it when you need help.") },
            confirmButton = {
                Button(onClick = { vm.raiseSos { showSosConfirm = false } }, enabled = !ui.busy) { Text("Raise SOS") }
            },
            dismissButton = { TextButton(onClick = { showSosConfirm = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun ActiveCheckInCard(checkIn: SafetyCheckIn, busy: Boolean, onSafe: () -> Unit, onCancel: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Shield, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(checkIn.label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            Text("Due ${dueLabel(checkIn.dueAt)}", style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onSafe, enabled = !busy) { Text("I reached safely") }
                OutlinedButton(onClick = onCancel, enabled = !busy) { Text("Cancel") }
            }
        }
    }
}

@Composable
private fun CheckInHistoryRow(checkIn: SafetyCheckIn) {
    Card {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                when (checkIn.safetyStatus) {
                    SafetyStatus.SAFE -> Icons.Filled.CheckCircle
                    SafetyStatus.ESCALATED -> Icons.Filled.Warning
                    else -> Icons.Filled.Close
                },
                contentDescription = null,
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(checkIn.label, fontWeight = FontWeight.SemiBold)
                Text(dueLabel(checkIn.dueAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(
                when (checkIn.safetyStatus) {
                    SafetyStatus.SAFE -> "Safe"
                    SafetyStatus.ESCALATED -> "Escalated"
                    SafetyStatus.CANCELLED -> "Cancelled"
                    SafetyStatus.PENDING -> "Pending"
                },
                style = MaterialTheme.typography.labelLarge,
            )
        }
    }
}

@Composable
private fun ContactRow(contact: SafetyContact, busy: Boolean, onRemove: () -> Unit) {
    Card {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Person, contentDescription = null)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(contact.name, fontWeight = FontWeight.SemiBold)
                if (contact.phone.isNotBlank()) {
                    Text(contact.phone, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            IconButton(onClick = onRemove, enabled = !busy) { Icon(Icons.Filled.Delete, contentDescription = "Remove contact") }
        }
    }
}

@Composable
private fun AddContactDialog(onDismiss: () -> Unit, onSave: (String, String) -> Unit) {
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Filled.Phone, contentDescription = null) },
        title = { Text("Add safety contact") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("Phone number") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "GaGa records this contact for your check-ins. It never dials or texts automatically.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = { Button(onClick = { onSave(name, phone) }) { Text("Add") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun NewCheckInDialog(onDismiss: () -> Unit, onSave: (String, Int) -> Unit) {
    var label by remember { mutableStateOf("") }
    var minutes by remember { mutableStateOf(30) }
    val options = listOf(15, 30, 60, 120)
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Filled.Shield, contentDescription = null) },
        title = { Text("Check on me") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = label,
                    onValueChange = { label = it },
                    label = { Text("What are you doing? (optional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Remind me in", style = MaterialTheme.typography.labelLarge)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    options.forEach { option ->
                        AssistChip(
                            onClick = { minutes = option },
                            label = { Text(if (option < 60) "$option min" else "${option / 60} hr") },
                            leadingIcon = if (minutes == option) {
                                { Icon(Icons.Filled.CheckCircle, contentDescription = null) }
                            } else null,
                        )
                    }
                }
            }
        },
        confirmButton = { Button(onClick = { onSave(label, minutes) }) { Text("Start") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
