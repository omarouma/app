package app.gagachat.security

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

/**
 * App Lock (Master Spec §C — security).
 *
 * When the user enables App Lock we gate the whole UI behind the device
 * credential (PIN / pattern / password / biometric) using the platform
 * [KeyguardManager]. This needs no extra dependency and reuses whatever the
 * device already trusts. The gate re-arms every time the app leaves the
 * foreground, so a resumed app always asks for the credential again.
 */
@Composable
fun AppLockGate(
    enabled: Boolean,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    var unlocked by remember { mutableStateOf(!enabled) }

    // Re-arm whenever the setting is turned on.
    LaunchedEffect(enabled) {
        if (enabled) unlocked = false else unlocked = true
    }

    // Re-arm when the app is backgrounded, so returning to it re-prompts.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(enabled, lifecycleOwner) {
        if (!enabled) return@DisposableEffect onDispose { }
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) unlocked = false
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) unlocked = true
    }

    fun promptUnlock() {
        val km = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
        val intent = if (km != null && km.isDeviceSecure) {
            km.createConfirmDeviceCredentialIntent(
                context.getString(app.gagachat.R.string.app_lock_title),
                context.getString(app.gagachat.R.string.app_lock_subtitle),
            )
        } else {
            null
        }
        if (intent != null) {
            launcher.launch(intent)
        } else {
            // No device credential configured — fail open rather than trap the user.
            unlocked = true
        }
    }

    // Auto-prompt as soon as the lock surface appears.
    LaunchedEffect(enabled, unlocked) {
        if (enabled && !unlocked) promptUnlock()
    }

    if (enabled && !unlocked) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.padding(32.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.Lock,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = context.getString(app.gagachat.R.string.app_lock_title),
                    style = MaterialTheme.typography.titleLarge,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = context.getString(app.gagachat.R.string.app_lock_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Button(onClick = { promptUnlock() }) {
                    Text(text = context.getString(app.gagachat.R.string.app_lock_unlock))
                }
            }
        }
    } else {
        content()
    }
}
