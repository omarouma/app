package app.gagachat.feature.chat.presentation.components

import android.net.Uri
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.PickVisualMediaRequest
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import java.io.File

/**
 * Native Android attachment launchers used by the chat composer.
 * Uses platform pickers so media access remains scoped and no broad storage
 * permission is required merely to choose an attachment.
 */
class MediaPickerLaunchers(
    val pickImages: () -> Unit,
    val pickVideo: () -> Unit,
    val pickFile: () -> Unit,
    val pickAudio: () -> Unit,
    val takePhoto: () -> Unit,
)

@Composable
fun rememberMediaPicker(
    onImagesPicked: (List<Uri>) -> Unit,
    onVideoPicked: (Uri) -> Unit,
    onFilePicked: (Uri) -> Unit,
    onAudioPicked: (Uri) -> Unit,
    onCameraPhotoPicked: (Uri) -> Unit,
): MediaPickerLaunchers {
    val context = LocalContext.current

    fun retainReadAccess(uri: Uri) {
        // When the platform picker supports persistable grants, retain them
        // for offline background upload retries across process death.
        // Other providers are gracefully handled by the existing immediate
        // staging/upload path without requiring broad storage permission.
        runCatching {
            context.contentResolver.takePersistableUriPermission(
                uri, Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        }
    }

    val imagesLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia(maxItems = 10),
    ) { uris ->
        if (uris.isNotEmpty()) {
            val selected = uris.take(10)
            selected.forEach(::retainReadAccess)
            onImagesPicked(selected)
        }
    }

    val videoLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri -> uri?.let { retainReadAccess(it); onVideoPicked(it) } }

    val fileLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri -> uri?.let(onFilePicked) }

    val audioLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri -> uri?.let(onAudioPicked) }

    // F11: capture at the camera's full resolution via TakePicture + a
    // FileProvider content:// URI. TakePicturePreview only returned a low-res
    // thumbnail bitmap, so captured photos looked blurry. The file lands in the
    // app-private cache and flows into the normal media-upload pipeline.
    var pendingCameraUri by remember { mutableStateOf<Uri?>(null) }
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture(),
    ) { success ->
        val uri = pendingCameraUri
        if (success && uri != null) onCameraPhotoPicked(uri)
    }

    return remember(imagesLauncher, videoLauncher, fileLauncher, audioLauncher, cameraLauncher) {
        MediaPickerLaunchers(
            pickImages = { imagesLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
            pickVideo = { videoLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)) },
            pickFile = { fileLauncher.launch(arrayOf(
                "application/pdf", "text/*", "application/msword",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/vnd.ms-excel",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "application/zip", "application/octet-stream",
            )) },
            pickAudio = { audioLauncher.launch(arrayOf("audio/*")) },
            takePhoto = {
                runCatching {
                    val dir = File(context.cacheDir, "chat_camera").apply { mkdirs() }
                    val file = File(
                        dir,
                        "gaga_${System.currentTimeMillis()}_${java.util.UUID.randomUUID().toString().take(8)}.jpg",
                    )
                    FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        file,
                    )
                }.getOrNull()?.let { uri ->
                    pendingCameraUri = uri
                    cameraLauncher.launch(uri)
                }
            },
        )
    }
}
