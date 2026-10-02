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
import app.gagachat.sync.outbox.OutboxScheduler
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

private val mediaUrlsJson = Json { ignoreUnknownKeys = true }

/** Serializes an ordered album's URLs to the JSON array stored in `mediaUrls`. */
private fun encodeMediaUrls(urls: List<String>): String = mediaUrlsJson.encodeToString(urls)

/**
 * One item in an ordered multi-photo album (F13).
 */
data class AlbumUploadItem(
    val localPath: String,
    val mime: String,
    val size: Long,
)

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

    /**
     * F13: queues an ordered album of photos as a *single* message. Each photo is
     * uploaded in the user-chosen order and the resulting URLs are stored on the
     * one message's `mediaUrls` list, so the recipient sees one album bubble.
     */
    suspend fun enqueueAlbumUpload(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        items: List<AlbumUploadItem>,
        caption: String?,
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
    private val outboxScheduler: OutboxScheduler,
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
        // Start the durable upload immediately. Previously media could remain QUEUED
        // forever because nothing scheduled MediaUploadWorker after enqueue.
        outboxScheduler.enqueueMediaUpload()
        AppResult.Success(message)
    }

    override suspend fun enqueueAlbumUpload(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        items: List<AlbumUploadItem>,
        caption: String?,
    ): AppResult<Message> = withContext(dispatchers.io) {
        if (items.isEmpty()) {
            return@withContext AppResult.Failure(AppError.Validation("No photos selected"))
        }
        if (items.any { it.size > app.gagachat.core.common.Constants.MAX_UPLOAD_BYTES }) {
            return@withContext AppResult.Failure(AppError.Validation("File too large"))
        }
        val clientMessageId = idGenerator.newClientMessageId()
        val now = timeProvider.nowMillis()
        val message = Message(
            localId = clientMessageId,
            clientMessageId = clientMessageId,
            conversationId = conversationId,
            senderId = senderId,
            type = MessageType.IMAGE,
            text = caption?.trim()?.takeIf { it.isNotEmpty() },
            createdAtClient = now,
            status = MessageStatus.PENDING,
            senderName = senderName,
            senderAvatar = senderAvatar,
            uploadProgress = 0,
            localMediaPath = items.first().localPath,
            mediaMime = items.first().mime,
            mediaSize = items.sumOf { it.size },
        )
        messageDao.upsert(message.toEntity())

        // One durable upload row per photo. Rows are inserted in the user's chosen
        // order and drained by rowid, so the album preserves that order (F13).
        items.forEach { item ->
            val upload = PendingUpload(
                uploadId = idGenerator.newUploadId(),
                clientMessageId = clientMessageId,
                conversationId = conversationId,
                localPath = item.localPath,
                mime = item.mime,
                size = item.size,
                type = MessageType.IMAGE,
                state = UploadState.QUEUED,
            )
            uploadDao.upsert(upload.toEntity())
        }
        outboxScheduler.enqueueMediaUpload()
        AppResult.Success(message)
    }

    override suspend fun processQueue() = withContext(dispatchers.io) {
        val queued = uploadDao.getQueued()
        // Group by target message, preserving rowid (insertion) order so album
        // photos upload and are stored in the exact order the user chose (F13).
        val groups = queued.groupBy { it.clientMessageId }

        for ((clientMessageId, uploads) in groups) {
            // The storage bucket's RLS policy scopes writes to the caller's own
            // top-level folder (`<userId>/...`), so the path MUST be prefixed with
            // the SENDER's user id -- not the conversation id.
            val senderId = messageDao.getByClientMessageId(clientMessageId)?.senderId
            if (senderId.isNullOrBlank()) {
                uploads.forEach {
                    uploadDao.updateState(it.uploadId, UploadState.FAILED.name, it.attempts + 1, null, null)
                }
                messageDao.updateStatus(clientMessageId, MessageStatus.FAILED.name, null, null)
                continue
            }

            val urls = ArrayList<String>(uploads.size)
            var failed = false
            for (upload in uploads) {
                val existing = upload.remoteUrl
                if (existing != null) {
                    urls.add(existing)
                    continue
                }
                uploadDao.updateState(upload.uploadId, UploadState.UPLOADING.name, upload.attempts, null, null)
                try {
                    val file = File(upload.localPath)
                    if (!file.exists() || file.length() == 0L) {
                        // The cached copy vanished (e.g. the OS cleared the cache
                        // dir). Fail the row deterministically instead of retrying a
                        // file that will never come back.
                        uploadDao.updateState(
                            upload.uploadId,
                            UploadState.FAILED.name,
                            upload.attempts + 1,
                            null,
                            null,
                        )
                        messageDao.updateStatus(clientMessageId, MessageStatus.FAILED.name, null, null)
                        failed = true
                        break
                    }
                    val extension = upload.mime.substringAfterLast('/', "bin")
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
                            messageDao.updateUploadProgress(clientMessageId, progress)
                            uploadDao.updateProgress(upload.uploadId, progress)
                        }
                    }
                    val url = try {
                        storageApi.uploadFile(objectPath, file, upload.mime) { progress ->
                            progressChannel.trySend(progress)
                        }
                    } finally {
                        progressChannel.close()
                        writer.join()
                    }
                    urls.add(url)
                    uploadDao.updateState(
                        upload.uploadId,
                        UploadState.UPLOADED.name,
                        upload.attempts,
                        url,
                        null,
                    )
                } catch (t: Throwable) {
                    if (t is kotlinx.coroutines.CancellationException) throw t
                    val attempts = upload.attempts + 1
                    val state = if (attempts >= app.gagachat.core.common.Constants.OUTBOX_MAX_ATTEMPTS) {
                        UploadState.FAILED
                    } else {
                        UploadState.QUEUED
                    }
                    uploadDao.updateState(upload.uploadId, state.name, attempts, null, null)
                    if (state == UploadState.FAILED) {
                        messageDao.updateStatus(clientMessageId, MessageStatus.FAILED.name, null, null)
                    }
                    failed = true
                    break
                }
            }

            // Only dispatch once every photo in the group has a durable URL.
            if (failed || urls.size != uploads.size) continue

            if (urls.size == 1) {
                messageDao.updateMedia(clientMessageId, urls.first(), null)
            } else {
                messageDao.updateMediaAlbum(clientMessageId, urls.first(), encodeMediaUrls(urls))
            }

            when (messageRepository.retry(clientMessageId)) {
                is AppResult.Success -> uploads.forEach { uploadDao.delete(it.uploadId) }
                else -> {
                    // Upload is durable; hand message delivery to the outbox.
                    outboxScheduler.enqueueMessageSend(clientMessageId)
                    uploads.forEach { uploadDao.delete(it.uploadId) }
                }
            }
        }
        if (uploadDao.getQueued().isNotEmpty()) throw java.io.IOException("Media uploads pending retry")
    }

    override fun observeUpload(clientMessageId: String): Flow<PendingUpload?> =
        uploadDao.observeByClientMessageId(clientMessageId).map { it?.toDomain() }
}
