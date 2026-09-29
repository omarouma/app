package app.gagachat

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.work.Configuration
import app.gagachat.core.common.di.ApplicationScope
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.data.preferences.SettingsPreferences
import app.gagachat.core.data.sync.RealtimeCoordinator
import app.gagachat.push.NotificationChannels
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.decode.VideoFrameDecoder
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Application entry point (PDF §2.1 `app`). Wires Hilt, provides the
 * WorkManager configuration (so workers can be Hilt-injected) and creates the
 * notification channels used by push and calls (PDF §8).
 *
 * It also owns the process-wide [RealtimeCoordinator] so the realtime socket is
 * connected for the whole app lifetime — the fast path for message deltas — with
 * the periodic sync workers acting as the offline safety net (PDF §4).
 */
@HiltAndroidApp
class GagaApplication : Application(), Configuration.Provider, ImageLoaderFactory {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    @Inject
    lateinit var realtimeCoordinator: RealtimeCoordinator

    @Inject
    @ApplicationScope
    lateinit var applicationScope: CoroutineScope

    @Inject
    lateinit var authRepository: AuthRepository

    @Inject
    lateinit var userRepository: UserRepository

    @Inject
    lateinit var settingsPreferences: SettingsPreferences

    /** Cached privacy flag — when false we never advertise "online" (Master Spec §C). */
    @Volatile
    private var shareLastSeen: Boolean = true

    /** Periodic presence heartbeat, alive only while the app is foregrounded. */
    private var presenceJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        NotificationChannels.createAll(this)
        // Connect the realtime fast path for the app lifetime. Safe to call
        // before a session exists: subscriptions are re-joined on reconnect.
        realtimeCoordinator.start(applicationScope)
        observePrivacyForPresence()
        observeAppLifecycleForPresence()
    }

    /**
     * Keeps the presence heartbeat honest about the "share last seen" privacy
     * setting: toggling it off immediately publishes "offline" so peers stop
     * seeing a stale online state.
     */
    private fun observePrivacyForPresence() {
        applicationScope.launch {
            settingsPreferences.shareLastSeenEnabled.collect { enabled ->
                shareLastSeen = enabled
                if (!enabled) publishPresence(isOnline = false)
            }
        }
    }

    /**
     * Presence heartbeat (Phase 8.2): the moment the app comes to the foreground
     * we publish "online" and refresh it on an interval; when it leaves the
     * foreground we publish "offline" and stop the heartbeat. This keeps
     * online/last-seen accurate without draining the battery in the background.
     */
    private fun observeAppLifecycleForPresence() {
        ProcessLifecycleOwner.get().lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onStart(owner: LifecycleOwner) {
                    publishPresence(isOnline = true)
                    presenceJob?.cancel()
                    presenceJob = applicationScope.launch {
                        while (isActive) {
                            delay(PRESENCE_HEARTBEAT_MS)
                            publishPresence(isOnline = true)
                        }
                    }
                }

                override fun onStop(owner: LifecycleOwner) {
                    presenceJob?.cancel()
                    presenceJob = null
                    publishPresence(isOnline = false)
                }
            },
        )
    }

    private fun publishPresence(isOnline: Boolean) {
        val userId = authRepository.sessionFlow.value?.userId ?: return
        // Privacy: when the user hides last seen we never advertise "online".
        val online = isOnline && shareLastSeen
        applicationScope.launch { userRepository.updatePresence(userId, online) }
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()

    /**
     * Registers the [VideoFrameDecoder] so Coil can render a real frame for
     * video-message thumbnails (the chat bubble shows the first frame before
     * playback). Everything else uses Coil's sensible defaults.
     */
    override fun newImageLoader(): ImageLoader =
        ImageLoader.Builder(this)
            .components { add(VideoFrameDecoder.Factory()) }
            .build()

    private companion object {
        const val PRESENCE_HEARTBEAT_MS = 45_000L
    }
}
