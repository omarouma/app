package app.gagachat.core.data.repository

import android.content.Context
import app.gagachat.core.common.di.ApplicationScope
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
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
        caption: String? = null,
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
    @ApplicationScope private val applicationScope: CoroutineScope,
) : MediaRepository {

    /**
     * Serialises [processQueue] so the immediate in-process drain and the
     * WorkManager worker can never upload the same row concurrently.
     */
    private val queueMutex = Mutex()

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
        caption: String?,
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
            text = caption?.trim()?.takeIf { it.isNotEmpty() },
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
        kickOffUpload()
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
            // Local copies let the album grid render every tile instantly while
            // the uploads are in flight; they are replaced by the durable remote
            // URLs in [processQueue] once every photo has landed.
            mediaUrls = items.map { it.localPath },
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
        kickOffUpload()
        AppResult.Success(message)
    }

    /**
     * Starts draining the upload queue. Schedules the durable WorkManager job
     * (survives process death and retries in the background) AND immediately
     * kicks off an in-process drain so the upload begins the instant the user
     * hits send.
     *
     * Media previously depended *only* on WorkManager, so any hiccup there left
     * the bubble stuck on "Preparing…" forever — unlike text messages, which
     * already had an inline send path ([MessageRepository] `dispatchOrQueue`).
     * Scheduling is best-effort: if WorkManager is unavailable for any reason we
     * still upload inline.
     */
    private fun kickOffUpload() {
        runCatching { outboxScheduler.enqueueMediaUpload() }
        applicationScope.launch {
            try {
                processQueue()
            } catch (t: kotlinx.coroutines.CancellationException) {
                throw t
            } catch (_: Throwable) {
                // Best-effort: the durable WorkManager job retries in the background.
            }
        }
    }

    override suspend fun processQueue() = queueMutex.withLock {
        reconcileOrphanedMedia()
        drainQueue()
    }

    /**
     * Safety net against an eternal "Preparing…" bubble. A media message that is
     * still PENDING with a local file but has *no* queue row can never make
     * progress (its row was lost — e.g. the process died between the two inserts,
     * or the row was pruned). Failing it hands the user a real retry affordance
     * instead of a spinner that never resolves.
     */
    private suspend fun reconcileOrphanedMedia() {
        runCatching { messageDao.failOrphanedMedia(timeProvider.nowMillis() - ORPHAN_GRACE_MS) }
    }

    private suspend fun drainQueue() = withContext(dispatchers.io) {
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
            val thumbUrls = ArrayList<String?>(uploads.size)
            var failed = false
            for (upload in uploads) {
                val existing = upload.remoteUrl
                if (existing != null) {
                    urls.add(existing)
                    thumbUrls.add(upload.thumbnailUrl)
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
                        // Hard ceiling on a single upload. Without it, one stalled
                        // socket can hold the queue mutex forever, wedging every
                        // later bubble on "Preparing…". On timeout we throw, which
                        // the catch below turns into a QUEUED retry (or FAILED once
                        // attempts are exhausted).
                        withTimeoutOrNull(UPLOAD_TIMEOUT_MS) {
                            storageApi.uploadFile(objectPath, file, upload.mime) { progress ->
                                progressChannel.trySend(progress)
                            }
                        } ?: throw java.io.IOException(
                            "Upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s",
                        )
                    } finally {
                        progressChannel.close()
                        writer.join()
                    }
                    urls.add(url)
                    // A poster frame for videos so the bubble renders a preview
                    // without downloading the clip. Best-effort: a failure here
                    // never fails the video upload itself.
                    val thumbUrl = if (upload.type == MessageType.VIDEO.name) {
                        uploadVideoThumbnail(senderId, upload.localPath, upload.uploadId)
                    } else {
                        null
                    }
                    thumbUrls.add(thumbUrl)
                    uploadDao.updateState(
                        upload.uploadId,
                        UploadState.UPLOADED.name,
                        upload.attempts,
                        url,
                        thumbUrl,
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
                messageDao.updateMedia(clientMessageId, urls.first(), thumbUrls.firstOrNull())
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

    /**
     * Generates and uploads a poster frame for a video so the bubble can render a
     * preview without downloading the clip. Best-effort: any failure (decode,
     * upload, no frame) returns null and leaves the video upload untouched.
     */
    private suspend fun uploadVideoThumbnail(senderId: String, localPath: String, uploadId: String): String? {
        val frame = extractVideoFrame(localPath, uploadId) ?: return null
        return try {
            val objectPath = storageApi.objectPath(senderId, "${uploadId}_thumb", "jpg")
            storageApi.uploadFile(objectPath, frame, "image/jpeg")
        } catch (t: Throwable) {
            if (t is kotlinx.coroutines.CancellationException) throw t
            null
        } finally {
            frame.delete()
        }
    }

    /**
     * Decodes a single frame from a local video file and writes it to a small JPEG
     * in the app cache. Returns null when no frame can be decoded. Never throws.
     */
    private fun extractVideoFrame(videoPath: String, uploadId: String): File? = runCatching {
        val retriever = android.media.MediaMetadataRetriever()
        try {
            retriever.setDataSource(videoPath)
            val frame = retriever.getFrameAtTime(0, android.media.MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                ?: retriever.getFrameAtTime()
                ?: return null
            val maxDimen = app.gagachat.core.common.Constants.THUMBNAIL_MAX_DIMEN_PX
            val longest = maxOf(frame.width, frame.height).coerceAtLeast(1)
            val scaled = if (longest > maxDimen) {
                val ratio = maxDimen.toFloat() / longest
                android.graphics.Bitmap.createScaledBitmap(
                    frame,
                    (frame.width * ratio).toInt().coerceAtLeast(1),
                    (frame.height * ratio).toInt().coerceAtLeast(1),
                    true,
                )
            } else {
                frame
            }
            val out = File(context.cacheDir, "thumb_$uploadId.jpg")
            out.outputStream().use { scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 80, it) }
            if (scaled !== frame) scaled.recycle()
            frame.recycle()
            out.takeIf { it.length() > 0L }
        } finally {
            retriever.release()
        }
    }.getOrNull()

    override fun observeUpload(clientMessageId: String): Flow<PendingUpload?> =
        uploadDao.observeByClientMessageId(clientMessageId).map { it?.toDomain() }

    private companion object {
        /** Hard ceiling on a single storage upload before it is retried. */
        const val UPLOAD_TIMEOUT_MS = 10 * 60 * 1000L

        /** Grace period before a queue-less PENDING media message is failed. */
        const val ORPHAN_GRACE_MS = 30_000L
    }
}
