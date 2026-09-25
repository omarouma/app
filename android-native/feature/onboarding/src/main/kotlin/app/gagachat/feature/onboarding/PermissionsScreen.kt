package app.gagachat.feature.onboarding

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSecondaryButton
import app.gagachat.core.ui.theme.GagaDimens

/**
 * Third onboarding step (Master Spec §C): request the runtime permissions the
 * app needs — microphone and camera for calling/QR, notifications for push.
 *
 * The user may skip; the app degrades gracefully and re-asks contextually later.
 */
@Composable
fun PermissionsScreen(onFinish: () -> Unit) {
    val context = LocalContext.current

    val permissions = remember {
        buildList {
            add(Manifest.permission.RECORD_AUDIO)
            add(Manifest.permission.CAMERA)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    fun granted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    var grantedMap by remember {
        mutableStateOf(permissions.associateWith { granted(it) })
    }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        grantedMap = permissions.associateWith { p -> result[p] ?: granted(p) }
        // Advance regardless of the outcome: the app degrades gracefully when a
        // permission is denied and re-asks contextually later. Without this the
        // user is stuck on this step after granting (only "Not now" advanced).
        onFinish()
    }

    GagaScaffold(
        title = "Stay connected",
        subtitle = "GaGa needs a few permissions to work fully",
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = GagaDimens.space24, vertical = GagaDimens.space16),
        ) {
            PermissionRow(
                icon = Icons.Filled.Mic,
                title = "Microphone",
                description = "For voice and video calls.",
                granted = grantedMap[Manifest.permission.RECORD_AUDIO] == true,
            )
            PermissionRow(
                icon = Icons.Filled.CameraAlt,
                title = "Camera",
                description = "For video calls and scanning QR codes.",
                granted = grantedMap[Manifest.permission.CAMERA] == true,
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                PermissionRow(
                    icon = Icons.Filled.Notifications,
                    title = "Notifications",
                    description = "To alert you about new messages and calls.",
                    granted = grantedMap[Manifest.permission.POST_NOTIFICATIONS] == true,
                )
            }

            Spacer(Modifier.height(GagaDimens.space32))

            GagaPrimaryButton(
                text = "Allow permissions",
                onClick = { launcher.launch(permissions.toTypedArray()) },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(GagaDimens.space12))
            GagaSecondaryButton(
                text = "Not now",
                onClick = onFinish,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(GagaDimens.space8))
            Text(
                text = "You can enable these any time from your device settings.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun PermissionRow(
    icon: ImageVector,
    title: String,
    description: String,
    granted: Boolean,
) {
    androidx.compose.foundation.layout.Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = GagaDimens.space12),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(end = GagaDimens.space16),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = MaterialTheme.typography.titleMedium)
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Icon(
            imageVector = if (granted) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
            contentDescription = if (granted) "Granted" else "Not granted",
            tint = if (granted) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
        )
    }
}
