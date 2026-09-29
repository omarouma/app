package app.gagachat.feature.chat.presentation.components

import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
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

    // TakePicturePreview avoids exposing a file URI and works on the broadest
    // Android device range. The preview bitmap is persisted to app cache before
    // entering the normal media-upload pipeline.
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicturePreview(),
    ) { bitmap: Bitmap? ->
        if (bitmap != null) {
            runCatching {
                val dir = File(context.cacheDir, "chat_camera").apply { mkdirs() }
                val file = File(dir, "gaga_${System.currentTimeMillis()}.jpg")
                file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it) }
                Uri.fromFile(file)
            }.getOrNull()?.let(onCameraPhotoPicked)
        }
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
            takePhoto = { cameraLauncher.launch(null) },
        )
    }
}
