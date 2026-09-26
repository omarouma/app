package app.gagachat

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import app.gagachat.core.common.di.ApplicationScope
import app.gagachat.core.data.sync.RealtimeCoordinator
import app.gagachat.push.NotificationChannels
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
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
class GagaApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    @Inject
    lateinit var realtimeCoordinator: RealtimeCoordinator

    @Inject
    @ApplicationScope
    lateinit var applicationScope: CoroutineScope

    override fun onCreate() {
        super.onCreate()
        NotificationChannels.createAll(this)
        // Connect the realtime fast path for the app lifetime. Safe to call
        // before a session exists: subscriptions are re-joined on reconnect.
        realtimeCoordinator.start(applicationScope)
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()
}
