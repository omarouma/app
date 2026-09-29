package app.gagachat.diagnostics

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp

/**
 * Shows the last captured crash report (if any) on the next launch.
 *
 * This is a diagnostic aid: it surfaces the exact exception that stopped the
 * previous run so it can be screenshotted/copied even when the crash itself is
 * too early to render any UI. The report is also written to the Downloads
 * folder as `gaga_crash.txt`.
 */
@Composable
fun CrashReportGate(content: @Composable () -> Unit) {
    val context = LocalContext.current
    var report by remember { mutableStateOf(runCatching { CrashReporter.lastReport(context) }.getOrNull()) }

    content()

    val current = report
    if (!current.isNullOrBlank()) {
        AlertDialog(
            onDismissRequest = {
                CrashReporter.clear(context)
                report = null
            },
            title = { Text("Previous launch crashed") },
            text = {
                Text(
                    text = current,
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier
                        .heightIn(max = 360.dp)
                        .verticalScroll(rememberScrollState()),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    runCatching {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        clipboard.setPrimaryClip(ClipData.newPlainText("GaGa crash", current))
                    }
                    CrashReporter.clear(context)
                    report = null
                }) { Text("Copy & dismiss") }
            },
            dismissButton = {
                TextButton(onClick = {
                    CrashReporter.clear(context)
                    report = null
                }) { Text("Dismiss") }
            },
        )
    }
}
