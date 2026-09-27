package app.gagachat.sync.workers

import app.gagachat.sync.outbox.OutboxScheduler
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kicks off background sync when a session becomes available (PDF §4). Called
 * from the app shell after login/bootstrap; safe to call repeatedly because the
 * underlying work is unique.
 */
@Singleton
class SyncInitializer @Inject constructor(
    private val outboxScheduler: OutboxScheduler,
) {
    fun start() {
        outboxScheduler.schedulePeriodicSync()
        outboxScheduler.enqueueConversationSync()
    }
}
