package app.gagachat.feature.chat.presentation.components

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * F25: dialog for composing a poll. Starts with a question and two options; the
 * user can add up to ten. "Send" stays disabled until there is a question and at
 * least two non-blank options.
 */
@Composable
fun PollComposerDialog(
    onDismiss: () -> Unit,
    onSend: (question: String, options: List<String>) -> Unit,
    initialQuestion: String = "",
) {
    var question by remember(initialQuestion) { mutableStateOf(initialQuestion.take(240)) }
    var options by remember { mutableStateOf(listOf("", "")) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Create poll") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    value = question,
                    onValueChange = { question = it },
                    label = { Text("Question") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(GagaDimens.space8))
                options.forEachIndexed { index, value ->
                    OutlinedTextField(
                        value = value,
                        onValueChange = { newValue ->
                            options = options.toMutableList().also { it[index] = newValue }
                        },
                        label = { Text("Option ${index + 1}") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(GagaDimens.space6))
                }
                if (options.size < 10) {
                    TextButton(onClick = { options = options + "" }) {
                        Text("Add option")
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = question.isNotBlank() && options.count { it.isNotBlank() } >= 2,
                onClick = { onSend(question, options) },
            ) {
                Text("Send")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

/**
 * F21b: duration picker shown before a live-location share starts. The chosen
 * window bounds how long the sender's position keeps updating.
 */
@Composable
fun LiveLocationDurationDialog(
    onDismiss: () -> Unit,
    onSelect: (durationMillis: Long) -> Unit,
) {
    val choices = listOf(
        "15 minutes" to 15L * 60 * 1000,
        "1 hour" to 60L * 60 * 1000,
        "8 hours" to 8L * 60 * 60 * 1000,
    )
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Share live location") },
        text = {
            Column {
                Text(
                    text = "Choose how long to share your live location.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(GagaDimens.space8))
                choices.forEach { (label, millis) ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelect(millis) }
                            .padding(vertical = GagaDimens.space8),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Filled.Schedule,
                            contentDescription = null,
                            tint = GagaGreen,
                        )
                        Spacer(Modifier.width(GagaDimens.space8))
                        Text(text = label, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

/**
 * "Send later": lets the user choose a future instant to deliver the current
 * draft. A few quick presets cover the common cases, and the platform date/time
 * pickers allow an exact choice. Confirm stays disabled until the chosen instant
 * is actually in the future, so a scheduled message can never be born stale.
 */
@Composable
fun ScheduleMessageDialog(
    onDismiss: () -> Unit,
    onSchedule: (scheduledAtMillis: Long) -> Unit,
) {
    val context = LocalContext.current
    val now = remember { System.currentTimeMillis() }
    var selected by remember { mutableStateOf(now + 60L * 60 * 1000) }

    val formatter = remember { SimpleDateFormat("EEE, d MMM yyyy \u00b7 h:mm a", Locale.getDefault()) }
    val presets = remember(now) {
        listOf(
            "In 1 hour" to now + 60L * 60 * 1000,
            "In 3 hours" to now + 3L * 60 * 60 * 1000,
            "Tonight, 8:00 PM" to atHour(now, 20, 0),
            "Tomorrow, 9:00 AM" to atHour(now + 24L * 60 * 60 * 1000, 9, 0),
        )
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Schedule message") },
        text = {
            Column {
                Text(
                    text = "Send this message later. It will be delivered automatically at the time you pick.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(GagaDimens.space12))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Schedule, contentDescription = null, tint = GagaGreen)
                    Spacer(Modifier.width(GagaDimens.space8))
                    Text(
                        text = formatter.format(Date(selected)),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
                Spacer(Modifier.height(GagaDimens.space4))
                Row {
                    TextButton(onClick = {
                        val cal = Calendar.getInstance().apply { timeInMillis = selected }
                        DatePickerDialog(
                            context,
                            { _, year, month, day ->
                                cal.set(Calendar.YEAR, year)
                                cal.set(Calendar.MONTH, month)
                                cal.set(Calendar.DAY_OF_MONTH, day)
                                selected = cal.timeInMillis
                            },
                            cal.get(Calendar.YEAR),
                            cal.get(Calendar.MONTH),
                            cal.get(Calendar.DAY_OF_MONTH),
                        ).show()
                    }) { Text("Date") }
                    TextButton(onClick = {
                        val cal = Calendar.getInstance().apply { timeInMillis = selected }
                        TimePickerDialog(
                            context,
                            { _, hour, minute ->
                                cal.set(Calendar.HOUR_OF_DAY, hour)
                                cal.set(Calendar.MINUTE, minute)
                                cal.set(Calendar.SECOND, 0)
                                selected = cal.timeInMillis
                            },
                            cal.get(Calendar.HOUR_OF_DAY),
                            cal.get(Calendar.MINUTE),
                            false,
                        ).show()
                    }) { Text("Time") }
                }
                Spacer(Modifier.height(GagaDimens.space4))
                presets.forEach { (label, millis) ->
                    TextButton(
                        onClick = { selected = millis },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(text = label, modifier = Modifier.fillMaxWidth())
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = selected > System.currentTimeMillis(),
                onClick = { onSchedule(selected) },
            ) { Text("Schedule") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

/** Epoch millis for [baseMillis]'s calendar day at the given [hour]/[minute]. */
private fun atHour(baseMillis: Long, hour: Int, minute: Int): Long =
    Calendar.getInstance().apply {
        timeInMillis = baseMillis
        set(Calendar.HOUR_OF_DAY, hour)
        set(Calendar.MINUTE, minute)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis
