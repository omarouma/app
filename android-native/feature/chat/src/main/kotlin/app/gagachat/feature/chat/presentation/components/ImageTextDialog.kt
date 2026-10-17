package app.gagachat.feature.chat.presentation.components

import android.content.Intent
import android.net.Uri
import android.app.SearchManager
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/** Recognition stays local. Search and translation each require a separate action. */
@Composable
fun ImageTextDialog(uri: Uri, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    var chinese by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var text by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var translate by remember { mutableStateOf(false) }
    var confirmTranslate by remember { mutableStateOf(false) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Extract image text") }, text = {
        Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Recognize Latin or Chinese script on this device. Bengali recognition is not supported by these models.")
            Row {
                FilterChip(selected = !chinese, onClick = { if (!busy) chinese = false }, label = { Text("Latin") })
                Spacer(Modifier.width(8.dp))
                FilterChip(selected = chinese, onClick = { if (!busy) chinese = true }, label = { Text("Chinese") })
            }
            Button(enabled = !busy, onClick = {
                busy = true; error = null; text = ""
                scope.launch {
                    val recognizer = if (chinese) TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
                        else TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
                    try {
                        val image = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { InputImage.fromFilePath(context, uri) }
                        text = recognizer.process(image).await().text.take(20_000)
                        if (text.isBlank()) error = "No readable text found. Try another image or script."
                    } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
                    catch (failure: Exception) { error = "Couldn't recognize this image. Try again." }
                    finally { recognizer.close(); busy = false }
                }
            }) { Text(if (busy) "Recognizing…" else "Extract text") }
            if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (text.isNotBlank()) {
                SelectionContainer { Text(text) }
                Text("Search opens a web search app with this text. Translate sends the extracted text to your configured translation provider.", style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { clipboard.setText(AnnotatedString(text)) }) { Text("Copy text") }
                TextButton(onClick = { confirmTranslate = true }) { Text("Translate text") }
                TextButton(onClick = {
                    runCatching { context.startActivity(Intent(Intent.ACTION_WEB_SEARCH).putExtra(SearchManager.QUERY, text.take(1000))) }
                        .onFailure { error = "No web search app is available." }
                }) { Text("Search text") }
            }
        }
    }, confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } })
    if (confirmTranslate) AlertDialog(onDismissRequest = { confirmTranslate = false },
        title = { Text("Translate extracted text?") }, text = { Text("The extracted text will be sent to the configured translation service. The image stays on this device.") },
        confirmButton = { TextButton(onClick = { confirmTranslate = false; translate = true }) { Text("Translate") } },
        dismissButton = { TextButton(onClick = { confirmTranslate = false }) { Text("Cancel") } })
    if (translate) TranslateDialog(originalText = text, onDismiss = { translate = false })
}
