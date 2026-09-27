package app.gagachat.sync.workers

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.gagachat.core.data.repository.MediaRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Drains the durable media upload queue (PDF §6). Safe to run repeatedly: each
 * upload row carries its own state and progress, so a killed process resumes
 * where it left off.
 */
@HiltWorker
class MediaUploadWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val mediaRepository: MediaRepository,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        return runCatching {
            mediaRepository.processQueue()
            Result.success()
        }.getOrElse {
            if (runAttemptCount < 5) Result.retry() else Result.failure()
        }
    }
}
