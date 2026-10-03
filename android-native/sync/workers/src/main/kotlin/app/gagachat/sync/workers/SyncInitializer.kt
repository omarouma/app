package app.gagachat.sync.workers

import app.gagachat.core.common.di.ApplicationScope
import app.gagachat.core.data.repository.MediaRepository
import app.gagachat.sync.outbox.OutboxScheduler
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Kicks off background sync when a session becomes available (PDF §4). Called
 * from the app shell after login/bootstrap; safe to call repeatedly because the
 * underlying work is unique.
 */
@Singleton
class SyncInitializer @Inject constructor(
    private val outboxScheduler: OutboxScheduler,
    private val mediaRepository: MediaRepository,
    @ApplicationScope private val applicationScope: CoroutineScope,
) {
    fun start() {
        outboxScheduler.schedulePeriodicSync()
        outboxScheduler.enqueueConversationSync()
        // Drain any media uploads left over from a previous session (e.g. the
        // process was killed mid-upload, or a send happened while the durable
        // worker was unable to run). Doing this inline on launch means a bubble
        // stuck on "Preparing…" recovers the moment the app next opens.
        outboxScheduler.enqueueMediaUpload()
        applicationScope.launch {
            try {
                mediaRepository.processQueue()
            } catch (t: kotlinx.coroutines.CancellationException) {
                throw t
            } catch (_: Throwable) {
                // Best-effort; the durable WorkManager job retries in the background.
            }
        }
    }
}
