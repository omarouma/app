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
 * Retries a single pending text message (PDF §4 — idempotent send). The stable
 * `clientMessageId` is the idempotency key, so retries can never duplicate a
 * message on the server.
 */
@HiltWorker
class MessageSendWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val messageRepository: MessageRepository,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val clientMessageId = inputData.getString(OutboxWork.KEY_CLIENT_MESSAGE_ID)
            ?: return Result.failure()

        return when (messageRepository.retry(clientMessageId)) {
            is AppResult.Success -> Result.success()
            is AppResult.Failure ->
                if (runAttemptCount < Constants.OUTBOX_MAX_ATTEMPTS) Result.retry() else Result.failure()
            AppResult.Loading -> Result.retry()
        }
    }
}
