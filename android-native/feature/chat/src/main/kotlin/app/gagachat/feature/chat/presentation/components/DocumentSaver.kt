package app.gagachat.feature.chat.presentation.components

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import app.gagachat.core.model.Message
import app.gagachat.core.network.storage.MediaUrlResolver
import dagger.hilt.android.EntryPointAccessors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Lifecycle of a "save document to device" action (V3.0 Sprint B, row #6). */
sealed interface DocumentSaveState {
    data object Idle : DocumentSaveState
    data object Saving : DocumentSaveState
    data class Saved(val name: String) : DocumentSaveState
    data class Error(val message: String) : DocumentSaveState
}

/**
 * V3.0 Sprint B (checklist row #6): saves a FILE message to a location the user
 * chooses, via the Storage Access Framework (`ACTION_CREATE_DOCUMENT`).
 *
 * SAF needs no storage permission on any supported API level (26+), works for
 * both locally-held and remote (signed-URL) documents through
 * [resolveDocumentFile], and lets the user pick the destination folder and file
 * name. The chosen `content://` URI is written to directly, so nothing is left
 * in a shared folder the app cannot later manage. This complements
 * [DocumentOpener] (open) with the "save" half of the guide's "Open/save"
 * requirement.
 */
class DocumentSaver internal constructor(
    private val context: Context,
    private val resolver: MediaUrlResolver,
    private val scope: CoroutineScope,
) {
    var state by mutableStateOf<DocumentSaveState>(DocumentSaveState.Idle)
        private set

    /** Set by [rememberDocumentSaver] to the registered SAF launcher. */
    internal var launchCreate: ((suggestedName: String) -> Unit)? = null

    private var pending: Message? = null

    /** Begins a save by asking the user where to put the document. */
    fun save(message: Message) {
        val launcher = launchCreate
        if (launcher == null) {
            state = DocumentSaveState.Error("Saving isn't available right now.")
            return
        }
        pending = message
        launcher(documentSafeName(message.text))
    }

    /** Called with the user's chosen destination, or null if they cancelled. */
    internal fun onTargetChosen(uri: Uri?) {
        val message = pending ?: return
        pending = null
        if (uri == null) return
        scope.launch {
            state = DocumentSaveState.Saving
            try {
                val file = resolveDocumentFile(context, resolver, message)
                withContext(Dispatchers.IO) {
                    val out = context.contentResolver.openOutputStream(uri)
                        ?: throw IllegalStateException("Couldn't open the chosen location")
                    out.use { sink -> file.inputStream().use { it.copyTo(sink) } }
                }
                state = DocumentSaveState.Saved(documentSafeName(message.text))
            } catch (t: Throwable) {
                if (t is kotlinx.coroutines.CancellationException) throw t
                state = DocumentSaveState.Error(t.message ?: "Couldn't save the document")
            }
        }
    }

    fun dismiss() {
        state = DocumentSaveState.Idle
    }
}

@Composable
fun rememberDocumentSaver(): DocumentSaver {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val resolver = remember(context) {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            MediaResolverEntryPoint::class.java,
        ).mediaUrlResolver()
    }
    val saver = remember(context, resolver, scope) { DocumentSaver(context, resolver, scope) }
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("*/*"),
    ) { uri -> saver.onTargetChosen(uri) }
    // Keep the launcher reachable from the (non-composable) saver. Re-assigning
    // on recomposition is harmless: it is the same remembered launcher instance.
    saver.launchCreate = { name -> launcher.launch(name) }
    return saver
}
