package app.gagachat.sync.workers

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.ConversationRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Background delta sync of the conversation list (PDF §4). Only rows updated
 * since the last cursor are fetched, so the home list never reloads the full
 * dataset.
 */
@HiltWorker
class ConversationSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val conversationRepository: ConversationRepository,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        return when (conversationRepository.syncConversations()) {
            is AppResult.Success -> Result.success()
            is AppResult.Failure -> if (runAttemptCount < 5) Result.retry() else Result.failure()
            AppResult.Loading -> Result.retry()
        }
    }
}
