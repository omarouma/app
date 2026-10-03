package app.gagachat.sync.workers

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.gagachat.core.data.repository.CallRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.MediaRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Low-frequency safety-net sync (PDF §4). Runs every 15 minutes to reconcile
 * conversations and call history in case realtime events were missed while the
 * app was backgrounded or offline.
 *
 * It also drains the durable media upload queue so a bubble that got stuck on
 * "Preparing…" (e.g. the process was killed mid-upload, or WorkManager deferred
 * the one-shot job) is guaranteed to recover within one sync window.
 */
@HiltWorker
class PeriodicSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val conversationRepository: ConversationRepository,
    private val callRepository: CallRepository,
    private val mediaRepository: MediaRepository,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        runCatching { conversationRepository.syncConversations() }
        runCatching { callRepository.syncHistory() }
        runCatching { mediaRepository.processQueue() }
        return Result.success()
    }
}
