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
import app.gagachat.core.network.session.SessionStore
import app.gagachat.core.network.error.ErrorMapper
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
    suspend fun retryUpload(clientMessageId: String): AppResult<Unit>

    suspend fun processQueue()

    fun observeUpload(clientMessageId: String): Flow<PendingUpload?>
}

@Singleton
class DefaultMediaRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val messageDao: MessageDao,
    private val uploadDao: UploadDao,
    private val storageApi: SupabaseStorageApi,
    private val sessionStore: SessionStore,
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
        if (sessionStore.userId() != senderId) return@withContext AppResult.Failure(AppError.Unauthorized("Sign in again to send this attachment."))
        val durableFile = try { durableCopy(localPath, uploadId) } catch (t: Exception) {
            if (t is kotlinx.coroutines.CancellationException) throw t
            return@withContext AppResult.Failure(AppError.Validation("This file is unavailable or too large. Select it again.", t))
        }
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
            localMediaPath = durableFile.absolutePath,
            mediaMime = mime,
            mediaSize = durableFile.length(),
            mediaDurationMs = durationMs,
        )
        val upload = PendingUpload(
            uploadId = uploadId,
            clientMessageId = clientMessageId,
            conversationId = conversationId,
            localPath = durableFile.absolutePath,
            mime = mime,
            size = durableFile.length(),
            type = type,
            state = UploadState.QUEUED,
        )
        try { uploadDao.enqueue(message.toEntity(), listOf(upload.toEntity())) } catch (t: Throwable) {
            durableFile.delete()
            if (t is kotlinx.coroutines.CancellationException) throw t
            return@withContext AppResult.Failure(ErrorMapper.map(t))
        }
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
        if (sessionStore.userId() != senderId) return@withContext AppResult.Failure(AppError.Unauthorized("Sign in again to send this album."))
        if (items.size > 10) return@withContext AppResult.Failure(AppError.Validation("Choose up to 10 photos per album."))
        val clientMessageId = idGenerator.newClientMessageId()
        val staged = mutableListOf<File>()
        val uploads = try {
            items.map { item ->
                val uploadId = idGenerator.newUploadId()
                val file = durableCopy(item.localPath, uploadId).also(staged::add)
                PendingUpload(uploadId = uploadId, clientMessageId = clientMessageId,
                    conversationId = conversationId, localPath = file.absolutePath,
                    mime = item.mime, size = file.length(), type = MessageType.IMAGE,
                    state = UploadState.QUEUED).toEntity()
            }
        } catch (t: Throwable) {
            staged.forEach { it.delete() }
            if (t is kotlinx.coroutines.CancellationException) throw t
            return@withContext AppResult.Failure(AppError.Validation("A photo is unavailable or too large. Select the album again.", t))
        }
        val message = Message(
            localId = clientMessageId, clientMessageId = clientMessageId,
            conversationId = conversationId, senderId = senderId,
            type = MessageType.IMAGE, text = caption?.trim()?.takeIf { it.isNotEmpty() },
            createdAtClient = timeProvider.nowMillis(), status = MessageStatus.PENDING,
            senderName = senderName, senderAvatar = senderAvatar, uploadProgress = 0,
            localMediaPath = uploads.first().localPath, mediaMime = uploads.first().mime,
            mediaSize = uploads.sumOf { it.size }, mediaUrls = uploads.map { it.localPath },
        )
        try { uploadDao.enqueue(message.toEntity(), uploads) } catch (t: Throwable) {
            staged.forEach { it.delete() }
            if (t is kotlinx.coroutines.CancellationException) throw t
            return@withContext AppResult.Failure(ErrorMapper.map(t))
        }
        kickOffUpload()
        AppResult.Success(message)
    }

    private fun durableCopy(localPath: String, uploadId: String): File {
        val source = File(localPath)
        require(source.isFile && source.length() in 1L..app.gagachat.core.common.Constants.MAX_UPLOAD_BYTES)
        val folder = File(context.filesDir, "pending_media").apply { check(isDirectory || mkdirs()) }
        val target = File(folder, uploadId)
        try { source.copyTo(target, overwrite = true) } catch (t: Throwable) { target.delete(); throw t }
        return target
    }

    override suspend fun retryUpload(clientMessageId: String): AppResult<Unit> = withContext(dispatchers.io) {
        val result = queueMutex.withLock {
            val message = messageDao.getByClientMessageId(clientMessageId)
                ?: return@withLock AppResult.Failure(AppError.Validation("Message not found"))
            if (message.senderId != sessionStore.userId()) return@withLock AppResult.Failure(AppError.Unauthorized())
            val rows = uploadDao.getForMessage(clientMessageId)
            if (rows.isEmpty()) return@withLock AppResult.Failure(AppError.Validation("Select the attachment again; its upload record is missing."))
            if (rows.any { it.remoteUrl == null && (!File(it.localPath).isFile || File(it.localPath).length() == 0L) }) {
                return@withLock AppResult.Failure(AppError.Validation("This file is no longer available. Select it again."))
            }
            // Retry all album rows together, retaining successfully uploaded objects.
            uploadDao.resetForRetry(clientMessageId)
            messageDao.updateStatus(message.localId, MessageStatus.PENDING.name, null, null)
            AppResult.Success(Unit)
        }
        if (result is AppResult.Success) kickOffUpload()
        result
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
        drainQueue()
    }

    private suspend fun drainQueue() = withContext(dispatchers.io) {
        val queued = uploadDao.getQueued()
        // Group by target message, preserving rowid (insertion) order so album
        // photos upload and are stored in the exact order the user chose (F13).
        val messageIds = queued.map { it.clientMessageId }.distinct()
        var needsRetry = false
        for (clientMessageId in messageIds) {
            // Include FAILED rows when evaluating an album. Excluding one used
            // to send an incomplete album on the next worker attempt.
            val uploads = uploadDao.getForMessage(clientMessageId)
            if (uploads.isEmpty()) continue
            // The storage bucket's RLS policy scopes writes to the caller's own
            // top-level folder (`<userId>/...`), so the path MUST be prefixed with
            // the SENDER's user id -- not the conversation id.
            val message = messageDao.getByClientMessageId(clientMessageId)
            val senderId = message?.senderId
            if (senderId.isNullOrBlank()) {
                uploads.forEach {
                    uploadDao.updateState(it.uploadId, UploadState.FAILED.name, it.attempts + 1, null, null)
                }
                messageDao.updateStatus(clientMessageId, MessageStatus.FAILED.name, null, null)
                continue
            }

            // Work from another account is never sent with the current JWT.
            if (sessionStore.userId() != senderId) continue
            if (message?.deletedAt != null || message?.hiddenForMe == true) {
                uploads.forEach { uploadDao.delete(it.uploadId) }
                continue
            }
            if (uploads.any { it.state == UploadState.FAILED.name }) {
                messageDao.updateStatus(clientMessageId, MessageStatus.FAILED.name, null, null)
                continue
            }
            val totalBytes = uploads.sumOf { it.size.coerceAtLeast(1L) }
            var completedBytes = 0L
            val urls = ArrayList<String>(uploads.size)
            val thumbUrls = ArrayList<String?>(uploads.size)
            var failed = false
            for (upload in uploads) {
                val existing = upload.remoteUrl
                if (existing != null) {
                    urls.add(existing)
                    thumbUrls.add(upload.thumbnailUrl)
                    completedBytes += upload.size.coerceAtLeast(1L)
                    continue
                }
                if (sessionStore.userId() != senderId) { failed = true; break }
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
                            val albumProgress = ((completedBytes + upload.size.coerceAtLeast(1L) * progress / 100L) * 100L / totalBytes).toInt().coerceIn(0, 100)
                            messageDao.updateUploadProgress(clientMessageId, albumProgress)
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
                    completedBytes += upload.size.coerceAtLeast(1L)
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
                    // A failed attempt must offer a visible Retry action even
                    // while WorkManager is arranging the next automatic attempt.
                    messageDao.updateStatus(clientMessageId, MessageStatus.FAILED.name, null, null)
                    if (state != UploadState.FAILED) needsRetry = true
                    failed = true
                    break
                }
            }

            // Only dispatch once every photo in the group has a durable URL.
            if (failed || urls.size != uploads.size || sessionStore.userId() != senderId) continue

            if (urls.size == 1) {
                messageDao.updateMedia(clientMessageId, urls.first(), thumbUrls.firstOrNull())
            } else {
                messageDao.updateMediaAlbum(clientMessageId, urls.first(), encodeMediaUrls(urls))
            }

            when (messageRepository.retry(clientMessageId)) {
                is AppResult.Success -> uploads.forEach { uploadDao.delete(it.uploadId) }
                else -> {
                    // Keep the uploaded rows until message acknowledgement. If
                    // scheduling or delivery fails, retry reuses the same objects.
                    needsRetry = true
                }
            }
        }
        if (needsRetry) throw java.io.IOException("Media uploads pending retry")
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
}

