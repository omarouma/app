package app.gagachat.core.data.repository

import android.content.Context
import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.IdGenerator
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.database.dao.MessageDao
import app.gagachat.core.database.dao.UploadDao
import app.gagachat.core.database.mapper.toDomain
import app.gagachat.core.database.mapper.toEntity
import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageStatus
import app.gagachat.core.model.MessageType
import app.gagachat.core.model.PendingUpload
import app.gagachat.core.model.UploadState
import app.gagachat.core.network.storage.SupabaseStorageApi
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Media upload pipeline (PDF §6): local preview → optional compression → upload
 * queue → storage → durable URL → confirm message. Retry-safe via stable upload id.
 */
interface MediaRepository {
    suspend fun enqueueUpload(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        localPath: String,
        mime: String,
        size: Long,
        type: MessageType,
        durationMs: Long? = null,
    ): AppResult<Message>

    /** Processes the durable upload queue; safe to call from a background worker. */
    suspend fun processQueue()

    fun observeUpload(clientMessageId: String): Flow<PendingUpload?>
}

@Singleton
class DefaultMediaRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val messageDao: MessageDao,
    private val uploadDao: UploadDao,
    private val storageApi: SupabaseStorageApi,
    private val messageRepository: MessageRepository,
    private val idGenerator: IdGenerator,
    private val timeProvider: TimeProvider,
    private val dispatchers: DispatcherProvider,
) : MediaRepository {

    override suspend fun enqueueUpload(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        localPath: String,
        mime: String,
        size: Long,
        type: MessageType,
        durationMs: Long?,
    ): AppResult<Message> = withContext(dispatchers.io) {
        if (size > app.gagachat.core.common.Constants.MAX_UPLOAD_BYTES) {
            return@withContext AppResult.Failure(AppError.Validation("File too large"))
        }
        val clientMessageId = idGenerator.newClientMessageId()
        val uploadId = idGenerator.newUploadId()
        val now = timeProvider.nowMillis()

        val message = Message(
            localId = clientMessageId,
            clientMessageId = clientMessageId,
            conversationId = conversationId,
            senderId = senderId,
            type = type,
            text = null,
            createdAtClient = now,
            status = MessageStatus.PENDING,
            senderName = senderName,
            senderAvatar = senderAvatar,
            uploadProgress = 0,
            localMediaPath = localPath,
            mediaMime = mime,
            mediaSize = size,
            mediaDurationMs = durationMs,
        )
        messageDao.upsert(message.toEntity())

        val upload = PendingUpload(
            uploadId = uploadId,
            clientMessageId = clientMessageId,
            conversationId = conversationId,
            localPath = localPath,
            mime = mime,
            size = size,
            type = type,
            state = UploadState.QUEUED,
        )
        uploadDao.upsert(upload.toEntity())
        AppResult.Success(message)
    }

    override suspend fun processQueue() = withContext(dispatchers.io) {
        val queued = uploadDao.getQueued()
        for (upload in queued) {
            uploadDao.updateState(upload.uploadId, UploadState.UPLOADING.name, upload.attempts, null, null)
            try {
                val bytes = File(upload.localPath).readBytes()
                val extension = upload.mime.substringAfterLast('/', "bin")
                // The storage bucket's RLS policy scopes writes to the caller's own
                // top-level folder (`<userId>/...`), so the path MUST be prefixed with
                // the SENDER's user id -- not the conversation id.
                val senderId = messageDao.getByClientMessageId(upload.clientMessageId)?.senderId
                if (senderId.isNullOrBlank()) {
                    uploadDao.updateState(
                        upload.uploadId,
                        UploadState.FAILED.name,
                        upload.attempts + 1,
                        null,
                        null,
                    )
                    messageDao.updateStatus(
                        upload.clientMessageId,
                        MessageStatus.FAILED.name,
                        null,
                        null,
                    )
                    continue
                }
                val objectPath = storageApi.objectPath(
                    userId = senderId,
                    uploadId = upload.uploadId,
                    extension = extension,
                )
                // Persist progress from a sibling coroutine instead of blocking the
                // upload thread with runBlocking.
                val progressChannel = Channel<Int>(Channel.CONFLATED)
                val writer = launch {
                    for (progress in progressChannel) {
                        messageDao.updateUploadProgress(upload.clientMessageId, progress)
                        uploadDao.updateProgress(upload.uploadId, progress)
                    }
                }
                val url = try {
                    storageApi.upload(objectPath, bytes, upload.mime) { progress ->
                        progressChannel.trySend(progress)
                    }
                } finally {
                    progressChannel.close()
                    writer.join()
                }
                messageDao.updateMedia(upload.clientMessageId, url, null)
                uploadDao.updateState(
                    upload.uploadId,
                    UploadState.UPLOADED.name,
                    upload.attempts,
                    url,
                    null,
                )
                // Now dispatch the message with its durable media URL.
                messageRepository.retry(upload.clientMessageId)
                uploadDao.delete(upload.uploadId)
            } catch (t: Throwable) {
                val attempts = upload.attempts + 1
                val state = if (attempts >= app.gagachat.core.common.Constants.OUTBOX_MAX_ATTEMPTS) {
                    UploadState.FAILED
                } else {
                    UploadState.QUEUED
                }
                uploadDao.updateState(upload.uploadId, state.name, attempts, null, null)
                if (state == UploadState.FAILED) {
                    messageDao.updateStatus(upload.clientMessageId, MessageStatus.FAILED.name, null, null)
                }
            }
        }
    }

    override fun observeUpload(clientMessageId: String): Flow<PendingUpload?> =
        uploadDao.observeByClientMessageId(clientMessageId).map { it?.toDomain() }
}
