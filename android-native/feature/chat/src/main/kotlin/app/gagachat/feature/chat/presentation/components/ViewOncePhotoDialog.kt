package app.gagachat.feature.chat.presentation.components

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.SecureFlagPolicy
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.model.Message
import app.gagachat.core.network.rest.ViewOncePhotoApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import javax.inject.Inject

@HiltViewModel
class ViewOncePhotoViewModel @Inject constructor(private val api: ViewOncePhotoApi, auth: AuthRepository) : ViewModel() {
    val sessions = auth.sessionFlow
    suspend fun open(owner: String, message: Message) = api.open(owner, message.serverMessageId ?: error("Photo unavailable"))
}

/** Byte arrays and decoded images stay in this dialog; no Coil, disk cache or sharing URI. */
@Composable
fun ViewOncePhotoDialog(message: Message, onDismiss: () -> Unit, viewModel: ViewOncePhotoViewModel = hiltViewModel()) {
    val session by viewModel.sessions.collectAsStateWithLifecycle()
    val owner = remember(message.localId) { session?.userId }
    var bitmap by remember(message.localId) { mutableStateOf<Bitmap?>(null) }
    var attempted by remember(message.localId) { mutableStateOf(false) }
    var loading by remember(message.localId) { mutableStateOf(false) }
    var error by remember(message.localId) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(session?.userId) { if (owner == null || owner != session?.userId) onDismiss() }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_PAUSE) onDismiss() }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    DisposableEffect(bitmap) { val image = bitmap; onDispose { image?.recycle() } }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, securePolicy = SecureFlagPolicy.SecureOn)) {
        Surface(Modifier.fillMaxWidth().padding(16.dp)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("View-once photo", style = MaterialTheme.typography.titleLarge)
                bitmap?.let { Image(it.asImageBitmap(), "View-once photo", Modifier.fillMaxWidth().heightIn(max = 480.dp)) }
                if (loading) CircularProgressIndicator()
                if (!attempted) Text("Opening consumes this photo across all devices, even if the download is interrupted. It expires after 7 days. Close it to clear the photo.")
                error?.let { Text(it) }
                if (!attempted && owner != message.senderId) Button(onClick = {
                    attempted = true; loading = true
                    scope.launch {
                        var bytes: ByteArray? = null
                        try {
                            bytes = viewModel.open(owner ?: error("Sign in again"), message)
                            val decoded = withContext(Dispatchers.Default) {
                                val data = bytes!!
                                val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                                BitmapFactory.decodeByteArray(data, 0, data.size, options)
                                require(options.outWidth > 0 && options.outHeight > 0)
                                var sample = 1
                                while (options.outWidth / sample > 2048 || options.outHeight / sample > 2048) sample *= 2
                                BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
                            } ?: error("Photo unavailable")
                            if (viewModel.sessions.value?.userId == owner) bitmap = decoded else decoded.recycle()
                        } catch (t: Exception) {
                            if (t is CancellationException) throw t
                            error = "This photo has already been opened, expired or is unavailable."
                        } finally { bytes?.fill(0); loading = false }
                    }
                }) { Text("Open once") }
                if (owner == message.senderId) Text("Only the recipient can open this photo.")
                TextButton(onClick = onDismiss) { Text("Close") }
            }
        }
    }
}
