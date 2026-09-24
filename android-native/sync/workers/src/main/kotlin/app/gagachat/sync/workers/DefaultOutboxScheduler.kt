package app.gagachat.sync.workers

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import app.gagachat.sync.outbox.OutboxScheduler
import app.gagachat.sync.outbox.OutboxWork
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * WorkManager-backed [OutboxScheduler] (PDF §4, §6, §13). Every request uses a
 * network constraint and exponential backoff; unique work names prevent duplicate
 * scheduling for the same message or conversation.
 */
@Singleton
class DefaultOutboxScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
) : OutboxScheduler {

    private val workManager: WorkManager get() = WorkManager.getInstance(context)

    private val networkConstraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    override fun enqueueMessageSend(clientMessageId: String) {
        val request = OneTimeWorkRequestBuilder<MessageSendWorker>()
            .setConstraints(networkConstraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .setInputData(workDataOf(OutboxWork.KEY_CLIENT_MESSAGE_ID to clientMessageId))
            .addTag(OutboxWork.MESSAGE_SEND)
            .build()
        workManager.enqueueUniqueWork(
            "${OutboxWork.MESSAGE_SEND}_$clientMessageId",
            ExistingWorkPolicy.KEEP,
            request,
        )
    }

    override fun enqueueMediaUpload() {
        val request = OneTimeWorkRequestBuilder<MediaUploadWorker>()
            .setConstraints(networkConstraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .addTag(OutboxWork.MEDIA_UPLOAD)
            .build()
        workManager.enqueueUniqueWork(OutboxWork.MEDIA_UPLOAD, ExistingWorkPolicy.KEEP, request)
    }

    override fun enqueueConversationSync() {
        val request = OneTimeWorkRequestBuilder<ConversationSyncWorker>()
            .setConstraints(networkConstraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .addTag(OutboxWork.CONVERSATION_SYNC)
            .build()
        workManager.enqueueUniqueWork(OutboxWork.CONVERSATION_SYNC, ExistingWorkPolicy.KEEP, request)
    }

    override fun enqueueMessageSync(conversationId: String) {
        val request = OneTimeWorkRequestBuilder<MessageSyncWorker>()
            .setConstraints(networkConstraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .setInputData(workDataOf(OutboxWork.KEY_CONVERSATION_ID to conversationId))
            .addTag(OutboxWork.MESSAGE_SYNC)
            .build()
        workManager.enqueueUniqueWork(
            "${OutboxWork.MESSAGE_SYNC}_$conversationId",
            ExistingWorkPolicy.KEEP,
            request,
        )
    }

    override fun schedulePeriodicSync() {
        val request = PeriodicWorkRequestBuilder<PeriodicSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(networkConstraints)
            .addTag(OutboxWork.PERIODIC_SYNC)
            .build()
        workManager.enqueueUniquePeriodicWork(
            OutboxWork.PERIODIC_SYNC,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }
}
