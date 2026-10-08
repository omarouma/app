package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import app.gagachat.core.model.ConversationMember
import app.gagachat.core.model.DailyMoney

@Composable
fun SplitBillDialog(
    members: List<ConversationMember>,
    currentUserId: String,
    suggestedAmount: String?,
    suggestedCurrency: String?,
    onDismiss: () -> Unit,
    onCreate: (title: String, amountMinor: Long, currency: String, participantIds: List<String>) -> Unit,
) {
    var title by remember { mutableStateOf("Shared expense") }
    var amount by remember(suggestedAmount) { mutableStateOf(suggestedAmount.orEmpty()) }
    var currency by remember(suggestedCurrency) { mutableStateOf(suggestedCurrency?.takeIf { it in setOf("BDT","USD","CNY") } ?: "BDT") }
    val selected = remember(members) { mutableStateListOf<String>().apply { addAll(members.map { it.userId }.distinct().take(50)) } }
    val totalMinor = DailyMoney.parseMinor(amount)
    val valid = title.isNotBlank() && totalMinor != null && selected.size >= 2

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Split bill") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(title, { title = it.take(160) }, label = { Text("What was this for?") }, singleLine = true)
                OutlinedTextField(
                    amount, { amount = it.filter { ch -> ch.isDigit() || ch == '.' }.take(16) },
                    label = { Text("Total amount") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("BDT","USD","CNY").forEach { code ->
                        FilterChip(selected = currency == code, onClick = { currency = code }, label = { Text(code) })
                    }
                }
                Text("Split with", style = MaterialTheme.typography.labelLarge)
                LazyColumn(Modifier.heightIn(max = 220.dp)) {
                    items(members.distinctBy { it.userId }) { member ->
                        val checked = member.userId in selected
                        Row(
                            Modifier.fillMaxWidth().clickable {
                                if (checked) selected.remove(member.userId) else if (selected.size < 50) selected.add(member.userId)
                            }.padding(vertical = 4.dp)
                        ) {
                            Checkbox(checked = checked, onCheckedChange = null)
                            Spacer(Modifier.width(8.dp))
                            Text(member.displayName?.takeIf { it.isNotBlank() } ?: if (member.userId == currentUserId) "You" else "GaGa User")
                        }
                    }
                }
                if (valid) {
                    val per = totalMinor!! / selected.size
                    Text("About ${DailyMoney.format(per)} $currency each", style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(enabled = valid, onClick = { onCreate(title.trim(), totalMinor!!, currency, selected.toList()) }) { Text("Create split") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
