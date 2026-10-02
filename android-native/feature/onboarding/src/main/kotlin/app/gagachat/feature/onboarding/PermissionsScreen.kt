package app.gagachat.feature.onboarding

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Contacts
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.Button
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSecondaryButton
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen

/** One row on the permissions screen (reference screenshot 173528). */
private data class PermissionEntry(
    val permission: String,
    val icon: ImageVector,
    val tint: Color,
    val title: String,
    val description: String,
)

/**
 * Final onboarding step (reference screenshot 173528): the five permissions the
 * app can use — Notifications, Microphone, Camera, Location and Contacts — each
 * with its own Allow action, a "N of M permissions allowed" counter and
 * Back / Get Started actions. Every permission is optional; the app degrades
 * gracefully and re-asks contextually when a feature actually needs it.
 */
@Composable
fun PermissionsScreen(
    onFinish: () -> Unit,
    onBack: () -> Unit = {},
) {
    val context = LocalContext.current

    val entries = remember {
        buildList {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(
                    PermissionEntry(
                        permission = Manifest.permission.POST_NOTIFICATIONS,
                        icon = Icons.Filled.Notifications,
                        tint = Color(0xFF26A69A),
                        title = "Notifications",
                        description = "Get alerts for new messages and incoming calls, even when the app is closed.",
                    ),
                )
            }
            add(
                PermissionEntry(
                    permission = Manifest.permission.RECORD_AUDIO,
                    icon = Icons.Filled.Mic,
                    tint = Color(0xFF7E57C2),
                    title = "Microphone",
                    description = "Required for voice calls and sending voice messages to your friends.",
                ),
            )
            add(
                PermissionEntry(
                    permission = Manifest.permission.CAMERA,
                    icon = Icons.Filled.CameraAlt,
                    tint = Color(0xFF42A5F5),
                    title = "Camera",
                    description = "Required for video calls and sharing photos & videos in chats.",
                ),
            )
            add(
                PermissionEntry(
                    permission = Manifest.permission.ACCESS_FINE_LOCATION,
                    icon = Icons.Filled.LocationOn,
                    tint = Color(0xFFFF7043),
                    title = "Location",
                    description = "Share your live location with friends in chats when you choose to.",
                ),
            )
            add(
                PermissionEntry(
                    permission = Manifest.permission.READ_CONTACTS,
                    icon = Icons.Filled.Contacts,
                    tint = Color(0xFFFFA726),
                    title = "Contacts",
                    description = "Find friends from your device contacts who are already on GaGa.",
                ),
            )
        }
    }

    fun isGranted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    var grantedMap by remember {
        mutableStateOf(entries.associate { it.permission to isGranted(it.permission) })
    }
    var pending by remember { mutableStateOf<String?>(null) }

    val singleLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { isGrantedNow ->
        val permission = pending
        if (permission != null) {
            grantedMap = grantedMap + (permission to isGrantedNow)
        }
        pending = null
    }

    val allowedCount = entries.count { grantedMap[it.permission] == true }

    GagaScaffold(
        title = "App Permissions",
        subtitle = "GaGa works best with these permissions. You can change them anytime in settings.",
        onBack = onBack,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
        ) {
            entries.forEach { entry ->
                PermissionRow(
                    icon = entry.icon,
                    tint = entry.tint,
                    title = entry.title,
                    description = entry.description,
                    granted = grantedMap[entry.permission] == true,
                    onAllow = {
                        pending = entry.permission
                        singleLauncher.launch(entry.permission)
                    },
                )
                Spacer(Modifier.height(GagaDimens.space8))
            }

            Spacer(Modifier.height(GagaDimens.space8))
            Text(
                text = "$allowedCount of ${entries.size} permissions allowed",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(GagaDimens.space12))

            Row(horizontalArrangement = Arrangement.spacedBy(GagaDimens.space12)) {
                GagaSecondaryButton(
                    text = "Back",
                    onClick = onBack,
                    modifier = Modifier.weight(1f),
                )
                GagaPrimaryButton(
                    text = "Get Started",
                    onClick = onFinish,
                    leadingIcon = Icons.Filled.Check,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(GagaDimens.space8))
            Text(
                text = "You can enable these any time from your device settings.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(GagaDimens.space8))
            Text(
                text = "Step 10 of 10",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun PermissionRow(
    icon: ImageVector,
    tint: Color,
    title: String,
    description: String,
    granted: Boolean,
    onAllow: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(GagaDimens.space12),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(28.dp),
        )
        Spacer(Modifier.width(GagaDimens.space12))
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = MaterialTheme.typography.titleMedium)
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(GagaDimens.space8))
        if (granted) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Filled.CheckCircle,
                    contentDescription = null,
                    tint = GagaGreen,
                    modifier = Modifier.size(GagaDimens.iconSmall),
                )
                Spacer(Modifier.width(GagaDimens.space4))
                Text(
                    text = "Allowed",
                    style = MaterialTheme.typography.labelMedium,
                    color = GagaGreen,
                )
            }
        } else {
            Button(
                onClick = onAllow,
                shape = RoundedCornerShape(50),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                modifier = Modifier.height(36.dp),
            ) {
                Text(text = "Allow", style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}
