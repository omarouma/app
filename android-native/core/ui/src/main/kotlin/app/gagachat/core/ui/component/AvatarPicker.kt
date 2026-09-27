package app.gagachat.core.ui.component

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.gagachat.core.ui.theme.GagaDimens

/**
 * Avatar with an overlaid "change photo" affordance. Tapping the badge opens the
 * system photo picker (no storage permission required on modern Android) and hands
 * the chosen [Uri] back to the caller, which is responsible for uploading it.
 *
 * While [isUploading] is true the badge shows a spinner and further taps are
 * ignored, so a slow upload can never queue a second one.
 */
@Composable
fun GagaAvatarPicker(
    imageUrl: String?,
    name: String?,
    onImagePicked: (Uri) -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = GagaDimens.avatarXLarge,
    isUploading: Boolean = false,
) {
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri -> uri?.let(onImagePicked) }

    Box(modifier = modifier.size(size)) {
        GagaAvatar(imageUrl = imageUrl, name = name, size = size)

        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .size(size * 0.34f)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary)
                .border(2.dp, MaterialTheme.colorScheme.surface, CircleShape)
                .clickable(enabled = !isUploading) {
                    launcher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            if (isUploading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(size * 0.18f),
                    strokeWidth = 2.dp,
                    color = Color.White,
                )
            } else {
                Icon(
                    imageVector = Icons.Filled.PhotoCamera,
                    contentDescription = "Change photo",
                    tint = Color.White,
                    modifier = Modifier.size(size * 0.18f),
                )
            }
        }
    }
}
