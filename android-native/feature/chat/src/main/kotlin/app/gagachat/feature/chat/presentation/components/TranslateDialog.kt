package app.gagachat.feature.chat.presentation.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.TranslateLanguage
import app.gagachat.feature.chat.presentation.TranslateViewModel

/**
 * GaGa Language Bridge (Signature Features 2.4).
 *
 * On-demand translation of a single message. The original text stays visible
 * above the translation, and a disclosure makes clear that the text is sent to
 * a third-party translation service in the cloud before the user confirms.
 */
@Composable
fun TranslateDialog(
    originalText: String,
    onDismiss: () -> Unit,
    viewModel: TranslateViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val clipboard = LocalClipboardManager.current
    var menuOpen by remember { mutableStateOf(false) }

    // Kick off an initial translation into the default target language.
    LaunchedEffect(originalText) {
        viewModel.translate(originalText)
    }

    AlertDialog(
        onDismissRequest = {
            viewModel.reset()
            onDismiss()
        },
        icon = { Icon(Icons.Filled.Translate, contentDescription = null) },
        title = { Text("Translate message") },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Original", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.medium,
                ) {
                    Text(
                        originalText,
                        modifier = Modifier.fillMaxWidth().padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Translate to", style = MaterialTheme.typography.labelLarge)
                    Spacer(Modifier.width(8.dp))
                    OutlinedButton(onClick = { menuOpen = true }) {
                        Text(TranslateLanguage.labelFor(state.target))
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        TranslateLanguage.SUPPORTED.filter { it.code != "auto" }.forEach { language ->
                            DropdownMenuItem(
                                text = { Text(language.label) },
                                onClick = {
                                    menuOpen = false
                                    viewModel.setTarget(language.code)
                                    viewModel.translate(originalText)
                                },
                            )
                        }
                    }
                }

                when {
                    state.loading -> Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.width(20.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(12.dp))
                        Text("Translating\u2026", style = MaterialTheme.typography.bodyMedium)
                    }
                    state.error != null -> Text(
                        state.error.orEmpty(),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    state.result != null -> {
                        val result = state.result!!
                        Text("Translation", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer,
                            shape = MaterialTheme.shapes.medium,
                        ) {
                            Text(
                                result.translated.ifBlank { "\u2014" },
                                modifier = Modifier.fillMaxWidth().padding(12.dp),
                                style = MaterialTheme.typography.bodyLarge,
                            )
                        }
                        val detected = result.sourceLang?.let { " \u00b7 detected ${TranslateLanguage.labelFor(it)}" }.orEmpty()
                        Text(
                            "Translated to ${TranslateLanguage.labelFor(result.targetLang)}$detected",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                Text(
                    "The message text is sent to a third-party translation service for cloud processing. " +
                        "It is not stored by GaGa and the original message is never changed.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            val result = state.result
            if (result != null) {
                TextButton(onClick = { clipboard.setText(AnnotatedString(result.translated)) }) {
                    Text("Copy")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = {
                viewModel.reset()
                onDismiss()
            }) { Text("Close") }
        },
    )
}
