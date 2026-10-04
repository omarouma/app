package app.gagachat.feature.chat.presentation.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.common.network.NetworkMonitor
import app.gagachat.core.data.preferences.MediaDownloadPolicy
import app.gagachat.core.data.preferences.SettingsPreferences
import app.gagachat.core.network.storage.MediaUrlResolver
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent

/** Hilt access point so a feature composable can reach the app-scoped resolver. */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface MediaResolverEntryPoint {
    fun mediaUrlResolver(): MediaUrlResolver
    fun settingsPreferences(): SettingsPreferences
    fun networkMonitor(): NetworkMonitor
}

/**
 * F18: returns a URL that can be handed straight to Coil / VideoView / MediaPlayer.
 *
 * Local paths and `content://` URIs pass through untouched; a remote URL that
 * points at a private bucket (`chat-media`, `voice-messages`) is exchanged for a
 * short-lived signed URL. While the token is being minted the previous value is
 * returned (null on first load), so the caller just shows its loading state.
 */
@Composable
fun rememberSignedMediaUrl(raw: String?, autoDownload: Boolean = true): String? {
    if (raw.isNullOrBlank()) return null
    if (isLocalReference(raw)) return raw
    // When the user has disabled auto-download (or is on a metered network with a
    // Wi-Fi-only policy) we deliberately do NOT mint a signed URL, which is the
    // step that actually triggers the network fetch. The caller renders a
    // "tap to load" affordance and re-invokes with autoDownload = true.
    if (!autoDownload) return null

    val context = LocalContext.current
    val resolver = remember(context) {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            MediaResolverEntryPoint::class.java,
        ).mediaUrlResolver()
    }
    // Seed with the raw value for public URLs so nothing flickers.
    var resolved by remember(raw) {
        mutableStateOf(if (resolver.isPrivateStorageUrl(raw)) null else raw)
    }
    LaunchedEffect(raw) {
        resolved = resolver.resolve(raw)
    }
    return resolved
}

/**
 * Whether chat media may be fetched automatically right now, honouring the
 * "Data & Storage" preferences (Master Spec §C):
 *
 *  - the master **Auto-download media** switch, and
 *  - the **When to auto-download** policy (Always / Wi-Fi only / Never).
 *
 * The decision is reactive: toggling a setting, losing connectivity, or moving
 * between Wi-Fi and mobile data re-evaluates it and re-renders the bubbles.
 * `Never` (or the master switch off) always wins; `Wi-Fi only` blocks metered
 * networks; `Always` permits everything while online.
 */
@Composable
fun rememberAutoDownloadAllowed(): Boolean {
    val context = LocalContext.current
    val entryPoint = remember(context) {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            MediaResolverEntryPoint::class.java,
        )
    }
    val prefs = remember(entryPoint) { entryPoint.settingsPreferences() }
    val monitor = remember(entryPoint) { entryPoint.networkMonitor() }

    val enabled by prefs.autoDownloadEnabled.collectAsStateWithLifecycle(initialValue = true)
    val policy by prefs.mediaPolicy.collectAsStateWithLifecycle(initialValue = MediaDownloadPolicy.WIFI)
    val online by monitor.isOnline.collectAsStateWithLifecycle()
    val metered by monitor.isMetered.collectAsStateWithLifecycle()

    return when {
        !enabled -> false
        policy == MediaDownloadPolicy.NEVER -> false
        !online -> false
        policy == MediaDownloadPolicy.WIFI -> !metered
        else -> true
    }
}

/**
 * Resolves a list of remote media URLs (multi-photo albums). Order is preserved;
 * entries that are still being signed come back as null so the caller can render
 * its own placeholder rather than a broken image.
 */
@Composable
fun rememberSignedMediaUrls(raw: List<String>, autoDownload: Boolean = true): List<String?> {
    if (raw.isEmpty()) return emptyList()
    return raw.map { rememberSignedMediaUrl(it, autoDownload = autoDownload) }
}

/**
 * Returns [path] only while the local file it points at still exists.
 *
 * Optimistic bubbles carry a `localMediaPath` (a cache copy) so the sender sees
 * their own photo/video instantly with no network round-trip. But the OS may
 * reclaim the cache at any time; blindly trusting the path then renders a broken
 * bubble even though a perfectly good signed remote URL is available. Renderers
 * therefore try this first and fall back to the resolved remote URL.
 *
 * `content://` URIs (e.g. a fresh camera capture) are always treated as valid —
 * existence cannot be probed cheaply and they are short-lived by nature.
 */
@Composable
fun rememberExistingLocalMedia(path: String?): String? {
    if (path.isNullOrBlank()) return null
    if (!isLocalReference(path)) return null
    return remember(path) {
        when {
            path.startsWith("content://") -> path
            path.startsWith("file://") -> path.removePrefix("file://").let { java.io.File(it).exists() }
                .let { if (it) path else null }
            else -> if (java.io.File(path).exists()) path else null
        }
    }
}

private fun isLocalReference(value: String): Boolean =
    value.startsWith("content://") ||
        value.startsWith("file://") ||
        value.startsWith("/") ||
        !value.startsWith("http")
