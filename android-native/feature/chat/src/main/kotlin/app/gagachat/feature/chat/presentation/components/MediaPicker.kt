package app.gagachat.feature.chat.presentation.components

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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

    val imagesLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents(),
    ) { uris -> if (uris.isNotEmpty()) onImagesPicked(uris.take(10)) }

    val videoLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri -> uri?.let(onVideoPicked) }

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
            pickImages = { imagesLauncher.launch("image/*") },
            pickVideo = { videoLauncher.launch("video/*") },
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
