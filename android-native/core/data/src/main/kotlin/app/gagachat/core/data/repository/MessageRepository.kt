package app.gagachat.core.data.repository

import app.gagachat.core.common.Constants
import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.IdGenerator
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.data.mapper.toDomain
import app.gagachat.core.data.sync.SyncPolicy
import app.gagachat.core.database.dao.ConversationDao
import app.gagachat.core.database.dao.MessageDao
import app.gagachat.core.database.dao.SyncStateDao
import app.gagachat.core.database.entity.SyncStateEntity
import app.gagachat.core.database.mapper.toDomain
import app.gagachat.core.database.mapper.toEntity
import app.gagachat.core.model.Message
import app.gagachat.core.model.MessageStatus
import app.gagachat.core.model.MessageType
import app.gagachat.core.network.dto.ChatReadRow
import app.gagachat.core.network.dto.EpochMillisSerializer
import app.gagachat.core.network.dto.MessageInsert
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import app.gagachat.sync.outbox.OutboxScheduler
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Message access implementing the local-first, optimistic, idempotent send
 * pipeline.
 */
interface MessageRepository {
    fun observeMessages(
        conversationId: String,
        limit: Int = Constants.INITIAL_MESSAGE_PAGE_SIZE,
    ): Flow<List<Message>>

    suspend fun loadOlder(conversationId: String, beforeTimestamp: Long): AppResult<List<Message>>
    suspend fun syncNewMessages(conversationId: String): AppResult<Unit>

    suspend fun sendText(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        text: String,
        replyToMessageId: String? = null,
    ): AppResult<Message>

    suspend fun sendLocation(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        latitude: Double,
        longitude: Double,
    ): AppResult<Message>

    suspend fun sendCallEvent(
        conversationId: String,
        senderId: String,
        text: String,
    ): AppResult<Message>

    suspend fun retry(localId: String): AppResult<Unit>

    /** Marks a message as terminally FAILED once the outbox has exhausted retries. */
    suspend fun markFailed(localId: String)

    suspend fun editMessage(localId: String, text: String): AppResult<Unit>
    suspend fun deleteMessage(localId: String): AppResult<Unit>
    suspend fun markDelivered(conversationId: String, userId: String)
    suspend fun markRead(conversationId: String, userId: String)

    suspend fun applyRealtimeInsert(record: JsonObject)
    suspend fun applyRealtimeUpdate(record: JsonObject)

    /** Broadcasts this user's typing state to the peer (ephemeral, not persisted). */
    suspend fun setTyping(conversationId: String, userId: String, isTyping: Boolean)

    /** Emits whether [otherUserId] is currently typing in [conversationId]. */
    fun observeTyping(conversationId: String, otherUserId: String): Flow<Boolean>

    /** Applies an inbound realtime `typing` row to the ephemeral typing cache. */
    suspend fun applyTypingEvent(record: JsonObject)
}

@Singleton
class DefaultMessageRepository @Inject constructor(
    private val messageDao: MessageDao,
    private val conversationDao: ConversationDao,
    private val syncStateDao: SyncStateDao,
    private val restApi: SupabaseRestApi,
    private val outboxScheduler: OutboxScheduler,
    private val idGenerator: IdGenerator,
    private val timeProvider: TimeProvider,
    private val dispatchers: DispatcherProvider,
) : MessageRepository {

    /** Ephemeral typing cache: "chatId:userId" -> last known typing state. */
    private data class TypingEntry(val isTyping: Boolean, val updatedAt: Long)

    private val typingState = MutableStateFlow<Map<String, TypingEntry>>(emptyMap())


    override fun observeMessages(conversationId: String, limit: Int): Flow<List<Message>> =
        messageDao.observeLatest(conversationId, limit).map { list ->
            // DAO returns newest-first; UI wants oldest-first.
            list.map { it.toDomain() }.sortedBy { it.sortTimestamp }
        }

    override suspend fun loadOlder(
        conversationId: String,
        beforeTimestamp: Long,
    ): AppResult<List<Message>> = withContext(dispatchers.io) {
        try {
            val rows = restApi.getMessages(conversationId, Constants.MESSAGE_PAGE_SIZE, beforeTimestamp)
            val messages = rows.map { it.toDomain() }
            messageDao.upsertAll(messages.map { it.toEntity() })
            AppResult.Success(messages)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun syncNewMessages(conversationId: String): AppResult<Unit> =
        withContext(dispatchers.io) {
            try {
                val key = "messages:$conversationId"
                val cursor = syncStateDao.get(key)?.lastSyncedAt
                val rows = if (cursor == null) {
                    restApi.getMessages(conversationId, Constants.INITIAL_MESSAGE_PAGE_SIZE)
                } else {
                    restApi.getMessagesSince(conversationId, cursor, Constants.MESSAGE_PAGE_SIZE)
                }
                rows.map { it.toDomain() }.forEach { remote ->
                    val local = messageDao.getByServerMessageId(remote.serverMessageId ?: "")
                        ?: messageDao.getByClientMessageId(remote.clientMessageId)
                    if (local == null || SyncPolicy.shouldApplyRemote(local.status)) {
                        messageDao.upsert(remote.toEntity())
                    }
                }
                syncStateDao.upsert(SyncStateEntity(key, timeProvider.nowMillis(), null))
                AppResult.Success(Unit)
            } catch (t: Throwable) {
                AppResult.Failure(ErrorMapper.map(t))
            }
        }

    override suspend fun sendText(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        text: String,
        replyToMessageId: String?,
    ): AppResult<Message> = withContext(dispatchers.io) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) {
            return@withContext AppResult.Failure(AppError.Validation("Message is empty"))
        }
        val clientMessageId = idGenerator.newClientMessageId()
        val now = timeProvider.nowMillis()

        val pending = Message(
            localId = clientMessageId,
            clientMessageId = clientMessageId,
            conversationId = conversationId,
            senderId = senderId,
            type = MessageType.TEXT,
            text = trimmed,
            replyToMessageId = replyToMessageId,
            createdAtClient = now,
            status = MessageStatus.PENDING,
            senderName = senderName,
            senderAvatar = senderAvatar,
        )
        messageDao.upsert(pending.toEntity())
        updateConversationPreview(conversationId, clientMessageId, trimmed, now)
        outboxScheduler.enqueueMessageSend(clientMessageId)
        dispatchOrQueue(pending)
    }

    override suspend fun sendLocation(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        latitude: Double,
        longitude: Double,
    ): AppResult<Message> = withContext(dispatchers.io) {
        val clientMessageId = idGenerator.newClientMessageId()
        val now = timeProvider.nowMillis()
        val pending = Message(
            localId = clientMessageId,
            clientMessageId = clientMessageId,
            conversationId = conversationId,
            senderId = senderId,
            type = MessageType.LOCATION,
            text = "Location",
            latitude = latitude,
            longitude = longitude,
            createdAtClient = now,
            status = MessageStatus.PENDING,
            senderName = senderName,
            senderAvatar = senderAvatar,
        )
        messageDao.upsert(pending.toEntity())
        updateConversationPreview(conversationId, clientMessageId, "\uD83D\uDCCD Location", now)
        outboxScheduler.enqueueMessageSend(clientMessageId)
        dispatchOrQueue(pending)
    }

    override suspend fun sendCallEvent(
        conversationId: String,
        senderId: String,
        text: String,
    ): AppResult<Message> = withContext(dispatchers.io) {
        val clientMessageId = idGenerator.newClientMessageId()
        val now = timeProvider.nowMillis()
        val pending = Message(
            localId = clientMessageId,
            clientMessageId = clientMessageId,
            conversationId = conversationId,
            senderId = senderId,
            type = MessageType.CALL_EVENT,
            text = text,
            createdAtClient = now,
            status = MessageStatus.PENDING,
        )
        messageDao.upsert(pending.toEntity())
        updateConversationPreview(conversationId, clientMessageId, text, now)
        outboxScheduler.enqueueMessageSend(clientMessageId)
        dispatchOrQueue(pending)
    }

    override suspend fun retry(localId: String): AppResult<Unit> = withContext(dispatchers.io) {
        val entity = messageDao.getByLocalId(localId)
            ?: return@withContext AppResult.Failure(AppError.Validation("Message not found"))
        // Idempotency guard: if the optimistic inline send already succeeded, the
        // queued worker must not re-insert the same message.
        if (entity.status == MessageStatus.SENT.name || entity.serverMessageId != null) {
            return@withContext AppResult.Success(Unit)
        }
        messageDao.updateStatus(localId, MessageStatus.PENDING.name, null, null)
        // Surface the real outcome so the outbox worker can back off and retry
        // instead of treating every attempt as a success.
        when (val result = dispatch(entity.toDomain())) {
            is AppResult.Success -> AppResult.Success(Unit)
            is AppResult.Failure -> result
            AppResult.Loading -> AppResult.Loading
        }
    }

    override suspend fun markFailed(localId: String) = withContext(dispatchers.io) {
        val entity = messageDao.getByLocalId(localId) ?: return@withContext
        // Never downgrade a message that already made it to the server.
        if (entity.status == MessageStatus.SENT.name || entity.serverMessageId != null) {
            return@withContext
        }
        messageDao.updateStatus(localId, MessageStatus.FAILED.name, null, null)
    }

    override suspend fun editMessage(localId: String, text: String): AppResult<Unit> =
        withContext(dispatchers.io) {
            val entity = messageDao.getByLocalId(localId)
                ?: return@withContext AppResult.Failure(AppError.Validation("Message not found"))
            val now = timeProvider.nowMillis()
            messageDao.updateText(localId, text, now)
            entity.serverMessageId?.let { serverId ->
                runCatching { restApi.updateMessageText(serverId, text) }
            }
            AppResult.Success(Unit)
        }

    override suspend fun deleteMessage(localId: String): AppResult<Unit> =
        withContext(dispatchers.io) {
            val entity = messageDao.getByLocalId(localId)
                ?: return@withContext AppResult.Failure(AppError.Validation("Message not found"))
            val now = timeProvider.nowMillis()
            messageDao.markDeleted(localId, now)
            entity.serverMessageId?.let { serverId ->
                runCatching { restApi.deleteMessage(serverId) }
            }
            AppResult.Success(Unit)
        }

    override suspend fun markDelivered(conversationId: String, userId: String) =
        withContext(dispatchers.io) {
            val messages = messageDao.getLatest(conversationId, Constants.INITIAL_MESSAGE_PAGE_SIZE)
            val now = timeProvider.nowMillis()
            messages.filter { it.senderId != userId }.forEach { m ->
                m.serverMessageId?.let { id ->
                    runCatching { restApi.updateMessageDelivery(id, "delivered", now, null) }
                }
            }
        }

    override suspend fun markRead(conversationId: String, userId: String) =
        withContext(dispatchers.io) {
            val messages = messageDao.getLatest(conversationId, Constants.INITIAL_MESSAGE_PAGE_SIZE)
            val now = timeProvider.nowMillis()
            val lastIncoming = messages.firstOrNull { it.senderId != userId }
            lastIncoming?.serverMessageId?.let { id ->
                runCatching {
                    restApi.upsertChatRead(
                        ChatReadRow(
                            chatId = conversationId,
                            userId = userId,
                            lastReadMessageId = id,
                            lastReadAt = now,
                        ),
                    )
                }
            }
            messages.filter { it.senderId != userId }.forEach { m ->
                m.serverMessageId?.let { id ->
                    runCatching { restApi.updateMessageDelivery(id, "read", now, now) }
                }
            }
            conversationDao.updateUnreadCount(conversationId, 0)
        }

    override suspend fun applyRealtimeInsert(record: JsonObject) = withContext(dispatchers.io) {
        val serverId = record["id"]?.jsonPrimitive?.content ?: return@withContext
        val clientId = record["local_id"]?.jsonPrimitive?.content
        val existing = messageDao.getByServerMessageId(serverId)
            ?: clientId?.let { messageDao.getByClientMessageId(it) }
        val remote = recordToMessage(record)
        if (existing == null) {
            messageDao.upsert(remote.toEntity())
        } else if (SyncPolicy.shouldApplyRemote(existing.status)) {
            messageDao.upsert(remote.copy(localId = existing.localId).toEntity())
        } else {
            messageDao.updateStatus(
                existing.localId,
                MessageStatus.SENT.name,
                serverId,
                remote.createdAtServer,
            )
        }
    }

    override suspend fun applyRealtimeUpdate(record: JsonObject) = withContext(dispatchers.io) {
        val serverId = record["id"]?.jsonPrimitive?.content ?: return@withContext
        val existing = messageDao.getByServerMessageId(serverId) ?: return@withContext
        val remote = recordToMessage(record)
        messageDao.upsert(remote.copy(localId = existing.localId).toEntity())
    }

    override suspend fun setTyping(conversationId: String, userId: String, isTyping: Boolean) {
        withContext(dispatchers.io) {
            if (conversationId.isBlank() || userId.isBlank()) return@withContext
            // Best-effort: typing is ephemeral, so a failed broadcast is harmless.
            runCatching { restApi.upsertTyping(conversationId, userId, isTyping) }
            Unit
        }
    }

    override suspend fun applyTypingEvent(record: JsonObject) = withContext(dispatchers.io) {
        val chatId = record["chat_id"]?.jsonPrimitive?.content ?: return@withContext
        val userId = record["user_id"]?.jsonPrimitive?.content ?: return@withContext
        val isTyping = record["is_typing"]?.jsonPrimitive?.content?.toBoolean() ?: false
        typingState.update { it + ("$chatId:$userId" to TypingEntry(isTyping, timeProvider.nowMillis())) }
    }

    override fun observeTyping(conversationId: String, otherUserId: String): Flow<Boolean> {
        if (conversationId.isBlank() || otherUserId.isBlank()) return flowOf(false)
        val key = "$conversationId:$otherUserId"
        // Re-evaluate once a second so the indicator clears itself when the peer
        // stops typing and no further event arrives (TTL-based expiry).
        return combine(typingState, typingTicker()) { map, _ ->
            val entry = map[key]
            entry != null && entry.isTyping &&
                (timeProvider.nowMillis() - entry.updatedAt) < Constants.TYPING_TIMEOUT_MS
        }.distinctUntilChanged()
    }

    private fun typingTicker(): Flow<Unit> = flow {
        while (true) {
            emit(Unit)
            delay(1_000L)
        }
    }

    // ---- internals ----

    /**
     * Optimistic inline send used by the compose path. On success the row is SENT;
     * on failure the row is left PENDING (queued) so the durable outbox worker
     * retries it with backoff instead of surfacing a terminal failure to the user.
     */
    private suspend fun dispatchOrQueue(pending: Message): AppResult<Message> =
        when (val result = dispatch(pending)) {
            is AppResult.Success -> result
            is AppResult.Failure -> {
                messageDao.updateStatus(pending.localId, MessageStatus.PENDING.name, null, null)
                AppResult.Success(pending)
            }
            AppResult.Loading -> AppResult.Success(pending)
        }

    private suspend fun dispatch(pending: Message): AppResult<Message> = try {
        val row = restApi.insertMessage(
            MessageInsert(
                clientMessageId = pending.clientMessageId,
                conversationId = pending.conversationId,
                senderId = pending.senderId,
                type = pending.type.name.lowercase(),
                text = pending.text,
                mediaUrl = pending.mediaUrl,
                mediaUrls = pending.mediaUrl?.let { listOf(it) },
                replyToMessageId = pending.replyToMessageId,
                metadata = messageMetadata(pending),
            ),
        )
        messageDao.updateStatus(
            localId = pending.localId,
            status = MessageStatus.SENT.name,
            serverMessageId = row.id,
            createdAtServer = row.createdAt,
        )
        AppResult.Success(
            pending.copy(
                serverMessageId = row.id,
                createdAtServer = row.createdAt,
                status = MessageStatus.SENT,
            ),
        )
    } catch (t: Throwable) {
        messageDao.updateStatus(pending.localId, MessageStatus.FAILED.name, null, null)
        AppResult.Failure(ErrorMapper.map(t))
    }

    /**
     * Builds the `metadata` JSON carried alongside a message row. Location
     * messages store their coordinates; voice messages store their duration so
     * the receiving client can render the clip length without downloading it.
     */
    private fun messageMetadata(message: Message): JsonObject? {
        val obj = buildJsonObject {
            if (message.type == MessageType.LOCATION) {
                val lat = message.latitude
                val lng = message.longitude
                if (lat != null && lng != null) {
                    put("lat", lat)
                    put("lng", lng)
                }
            }
            if (message.type == MessageType.AUDIO) {
                message.mediaDurationMs?.let { put("duration_ms", it) }
            }
        }
        return if (obj.isEmpty()) null else obj
    }

    private suspend fun updateConversationPreview(
        conversationId: String,
        messageId: String,
        preview: String,
        timestamp: Long,
    ) {
        conversationDao.updateLastMessage(conversationId, messageId, preview, timestamp)
    }

    private fun recordToMessage(record: JsonObject): Message {
        fun str(key: String) = record[key]?.jsonPrimitive?.content
        fun ts(key: String) = EpochMillisSerializer.parseIso(str(key))
        val serverId = str("id") ?: ""
        val clientId = str("local_id") ?: serverId
        val type = str("type")?.let { runCatching { MessageType.valueOf(it.uppercase()) }.getOrNull() }
            ?: MessageType.TEXT
        val meta = record["metadata"] as? JsonObject
        return Message(
            localId = clientId,
            clientMessageId = clientId,
            serverMessageId = serverId,
            conversationId = str("chat_id") ?: "",
            senderId = str("sender_id") ?: "",
            type = type,
            text = str("content"),
            mediaUrl = str("media_url"),
            thumbnailUrl = null,
            replyToMessageId = str("reply_to"),
            createdAtClient = ts("created_at") ?: 0L,
            createdAtServer = ts("created_at"),
            status = MessageStatus.SENT,
            editedAt = if (str("edited") == "true") ts("updated_at") else null,
            deletedAt = if (str("destroyed") == "true") ts("updated_at") else null,
            latitude = if (type == MessageType.LOCATION) meta?.get("lat")?.jsonPrimitive?.content?.toDoubleOrNull() else null,
            longitude = if (type == MessageType.LOCATION) meta?.get("lng")?.jsonPrimitive?.content?.toDoubleOrNull() else null,
            mediaDurationMs = if (type == MessageType.AUDIO) meta?.get("duration_ms")?.jsonPrimitive?.content?.toLongOrNull() else null,
        )
    }
}
