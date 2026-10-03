package app.gagachat.sync.workers

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.gagachat.core.common.Constants
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.MessageRepository
import app.gagachat.sync.outbox.OutboxWork
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Delivers a message that was queued for a future time (Scheduled messages).
 *
 * The message row is written up-front with status `SCHEDULED` and a `scheduledAt`
 * instant; this worker is enqueued with a matching initial delay. When it fires it
 * flips the row into the normal idempotent send path via
 * [MessageRepository.dispatchScheduled], so a retry can never duplicate the
 * message on the server.
 */
@HiltWorker
class ScheduledMessageWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val messageRepository: MessageRepository,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val clientMessageId = inputData.getString(OutboxWork.KEY_CLIENT_MESSAGE_ID)
            ?: return Result.failure()

        return when (messageRepository.dispatchScheduled(clientMessageId)) {
            is AppResult.Success -> Result.success()
            is AppResult.Failure ->
                if (runAttemptCount < Constants.OUTBOX_MAX_ATTEMPTS) {
                    Result.retry()
                } else {
                    messageRepository.markFailed(clientMessageId)
                    Result.failure()
                }
            AppResult.Loading -> Result.retry()
        }
    }
}
