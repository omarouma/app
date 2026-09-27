package app.gagachat.feature.chat.presentation.components

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember

/**
 * Thin wrapper around the system photo/video/file pickers. Returns a stable
 * launcher object so the composer can trigger picks without leaking activity
 * result registrations across recompositions.
 */
class MediaPickerLaunchers(
    val pickImage: () -> Unit,
    val pickVideo: () -> Unit,
    val pickFile: () -> Unit,
)

@Composable
fun rememberMediaPicker(
    onImagePicked: (Uri) -> Unit,
    onVideoPicked: (Uri) -> Unit,
    onFilePicked: (Uri) -> Unit,
): MediaPickerLaunchers {
    val imageLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri -> uri?.let(onImagePicked) }

    val videoLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri -> uri?.let(onVideoPicked) }

    val fileLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri -> uri?.let(onFilePicked) }

    return remember(imageLauncher, videoLauncher, fileLauncher) {
        MediaPickerLaunchers(
            pickImage = { imageLauncher.launch("image/*") },
            pickVideo = { videoLauncher.launch("video/*") },
            pickFile = { fileLauncher.launch("*/*") },
        )
    }
}
