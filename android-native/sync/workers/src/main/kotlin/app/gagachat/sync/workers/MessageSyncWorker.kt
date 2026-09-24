package app.gagachat.sync.workers

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.MessageRepository
import app.gagachat.sync.outbox.OutboxWork
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Fetches new messages for a single conversation in the background (PDF §4).
 * Complements the realtime channel so a missed socket event is reconciled on the
 * next sync.
 */
@HiltWorker
class MessageSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val messageRepository: MessageRepository,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val conversationId = inputData.getString(OutboxWork.KEY_CONVERSATION_ID)
            ?: return Result.failure()
        return when (messageRepository.syncNewMessages(conversationId)) {
            is AppResult.Success -> Result.success()
            is AppResult.Failure -> if (runAttemptCount < 5) Result.retry() else Result.failure()
            AppResult.Loading -> Result.retry()
        }
    }
}
