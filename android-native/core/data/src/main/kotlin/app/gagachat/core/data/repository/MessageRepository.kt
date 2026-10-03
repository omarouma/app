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
import app.gagachat.core.network.dto.MessageRow
import kotlinx.serialization.json.decodeFromJsonElement
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import app.gagachat.sync.outbox.OutboxScheduler
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
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

    /**
     * F22: searches the conversation's full history on the server. Results are
     * cached locally so tapping one opens the surrounding thread.
     */
    suspend fun searchMessages(conversationId: String, query: String): AppResult<List<Message>>

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

    /**
     * Shares a live location that expires at [expiresAt] (epoch millis). The
     * sender updates it via [updateLiveLocation] and can end it early with
     * [stopLiveLocation]; recipients render a "Live" badge + countdown.
     */
    suspend fun sendLiveLocation(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        latitude: Double,
        longitude: Double,
        expiresAt: Long,
    ): AppResult<Message>

    /** Pushes fresh coordinates for an existing live-location message. */
    suspend fun updateLiveLocation(localId: String, latitude: Double, longitude: Double)

    /** Ends a live-location share early (expiry set to now). */
    suspend fun stopLiveLocation(localId: String)

    /** Sends a poll message (question + 2..10 options). */
    suspend fun sendPoll(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        question: String,
        options: List<String>,
    ): AppResult<Message>

    /**
     * Records [userId]'s vote for [optionIndex] on a poll message. Single-choice:
     * any previous selection by the same user is cleared first.
     */
    suspend fun votePoll(localId: String, optionIndex: Int, userId: String)

    suspend fun sendCallEvent(
        conversationId: String,
        senderId: String,
        text: String,
    ): AppResult<Message>

    suspend fun retry(localId: String): AppResult<Unit>

    /** Marks a message as terminally FAILED once the outbox has exhausted retries. */
    suspend fun markFailed(localId: String)

    /**
     * Schedules a text message for delivery at [scheduledAt] (epoch millis). The
     * row is persisted locally with [MessageStatus.SCHEDULED] and a durable
     * WorkManager job promotes it into the normal send path when the time
     * arrives. If [scheduledAt] is already in the past the message is sent now.
     */
    suspend fun scheduleMessage(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        text: String,
        scheduledAt: Long,
    ): AppResult<Message>

    /** Cancels a not-yet-sent scheduled message (removes the row and its job). */
    suspend fun cancelScheduled(localId: String)

    /**
     * Invoked by the scheduled-send worker at the due time: promotes the row out
     * of SCHEDULED and runs the normal idempotent send path.
     */
    suspend fun dispatchScheduled(clientMessageId: String): AppResult<Unit>

    suspend fun editMessage(localId: String, text: String): AppResult<Unit>
    suspend fun deleteMessage(localId: String): AppResult<Unit>

    /** Hides a message on this device only ("delete for me"); the server copy is untouched. */
    suspend fun deleteForMe(localId: String)

    /** Removes every locally-cached message for [conversationId] ("clear chat"). */
    suspend fun clearConversation(conversationId: String)

    /** Toggles [userId]'s [emoji] reaction on a message (add or remove). */
    suspend fun toggleReaction(localId: String, emoji: String, userId: String): AppResult<Unit>

    /** Sends a contact-card message. */
    suspend fun sendContact(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        contactName: String,
        contactPhone: String?,
    ): AppResult<Message>

    /** Forwards [source] into [conversationId] as a brand-new message. */
    suspend fun forwardMessage(
        source: Message,
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
    ): AppResult<Message>

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

    private val sendLocks = Array(64) { Mutex() }

    private val reactionsJson = Json { ignoreUnknownKeys = true }

    private fun parseReactions(raw: String?): Map<String, List<String>> =
        if (raw.isNullOrBlank()) emptyMap()
        else runCatching { reactionsJson.decodeFromString<Map<String, List<String>>>(raw) }
            .getOrDefault(emptyMap())

    private fun encodeReactions(map: Map<String, List<String>>): String? =
        if (map.isEmpty()) null else reactionsJson.encodeToString(map)

    /** Converts emoji -> userIds into the backend `reactions` jsonb shape. */
    private fun reactionsToJson(map: Map<String, List<String>>): JsonObject =
        JsonObject(map.mapValues { (_, users) -> JsonArray(users.map { JsonPrimitive(it) }) })

    /** Reads the backend `reactions` jsonb (emoji -> [userIds]) into a domain map. */
    private fun jsonToReactions(obj: JsonObject?): Map<String, List<String>> {
        if (obj == null) return emptyMap()
        return obj.mapNotNull { (emoji, value) ->
            val users = (value as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull }
            if (users.isNullOrEmpty()) null else emoji to users
        }.toMap()
    }


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
            if (t is CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun searchMessages(
        conversationId: String,
        query: String,
    ): AppResult<List<Message>> = withContext(dispatchers.io) {
        try {
            val rows = restApi.searchMessages(conversationId, query)
            val messages = rows.map { it.toDomain() }
            if (messages.isNotEmpty()) {
                messageDao.upsertAll(messages.map { it.toEntity() })
            }
            AppResult.Success(messages)
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun syncNewMessages(conversationId: String): AppResult<Unit> =
        withContext(dispatchers.io) {
            try {
                val key = "messages:$conversationId"
                val cursor = syncStateDao.get(key)?.lastSyncedAt
                // Advance only to timestamps actually fetched, never to device time.
                // Offset pagination drains every row, including equal-timestamp bursts.
                var offset = 0
                var newest = cursor
                do {
                    val rows = if (cursor == null) {
                        restApi.getMessages(conversationId, Constants.INITIAL_MESSAGE_PAGE_SIZE)
                    } else {
                        restApi.getMessagesSince(conversationId, cursor, Constants.MESSAGE_PAGE_SIZE, offset)
                    }
                    rows.map { it.toDomain() }.forEach { remote ->
                        val local = messageDao.getByServerMessageId(remote.serverMessageId ?: "")
                            ?: messageDao.getByClientMessageId(remote.clientMessageId)
                        messageDao.upsert(remote.copy(localId = local?.localId ?: remote.localId).toEntity())
                    }
                    rows.mapNotNull { it.createdAt }.maxOrNull()?.let { timestamp ->
                        newest = maxOf(newest ?: timestamp, timestamp)
                    }
                    offset += rows.size
                } while (cursor != null && rows.size == Constants.MESSAGE_PAGE_SIZE)
                newest?.let { syncStateDao.upsert(SyncStateEntity(key, it, null)) }
                AppResult.Success(Unit)
            } catch (t: Throwable) {
            if (t is CancellationException) throw t
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

    override suspend fun sendLiveLocation(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        latitude: Double,
        longitude: Double,
        expiresAt: Long,
    ): AppResult<Message> = withContext(dispatchers.io) {
        val clientMessageId = idGenerator.newClientMessageId()
        val now = timeProvider.nowMillis()
        val pending = Message(
            localId = clientMessageId,
            clientMessageId = clientMessageId,
            conversationId = conversationId,
            senderId = senderId,
            type = MessageType.LOCATION,
            text = "Live location",
            latitude = latitude,
            longitude = longitude,
            liveExpiresAt = expiresAt,
            createdAtClient = now,
            status = MessageStatus.PENDING,
            senderName = senderName,
            senderAvatar = senderAvatar,
        )
        messageDao.upsert(pending.toEntity())
        updateConversationPreview(conversationId, clientMessageId, "\uD83D\uDCCD Live location", now)
        outboxScheduler.enqueueMessageSend(clientMessageId)
        dispatchOrQueue(pending)
    }

    override suspend fun updateLiveLocation(localId: String, latitude: Double, longitude: Double) {
        withContext(dispatchers.io) {
            val entity = messageDao.getByLocalId(localId) ?: return@withContext
            val expiresAt = entity.liveExpiresAt ?: return@withContext
            messageDao.updateLiveLocation(localId, latitude, longitude)
            entity.serverMessageId?.let { serverId ->
                val meta = buildJsonObject {
                    put("lat", latitude)
                    put("lng", longitude)
                    put("live_expires_at", expiresAt)
                }
                runCatching { restApi.updateMessageMetadata(serverId, meta) }
            }
        }
    }

    override suspend fun stopLiveLocation(localId: String) {
        withContext(dispatchers.io) {
            val entity = messageDao.getByLocalId(localId) ?: return@withContext
            val now = timeProvider.nowMillis()
            messageDao.updateLiveExpiry(localId, now)
            entity.serverMessageId?.let { serverId ->
                val meta = buildJsonObject {
                    entity.latitude?.let { put("lat", it) }
                    entity.longitude?.let { put("lng", it) }
                    put("live_expires_at", now)
                }
                runCatching { restApi.updateMessageMetadata(serverId, meta) }
            }
        }
    }

    override suspend fun sendPoll(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        question: String,
        options: List<String>,
    ): AppResult<Message> = withContext(dispatchers.io) {
        val cleanOptions = options.map { it.trim() }.filter { it.isNotEmpty() }.take(10)
        val clientMessageId = idGenerator.newClientMessageId()
        val now = timeProvider.nowMillis()
        val pending = Message(
            localId = clientMessageId,
            clientMessageId = clientMessageId,
            conversationId = conversationId,
            senderId = senderId,
            type = MessageType.TEXT,
            text = question.trim(),
            pollQuestion = question.trim(),
            pollOptions = cleanOptions,
            createdAtClient = now,
            status = MessageStatus.PENDING,
            senderName = senderName,
            senderAvatar = senderAvatar,
        )
        messageDao.upsert(pending.toEntity())
        updateConversationPreview(conversationId, clientMessageId, "\uD83D\uDCCA Poll: ${question.trim()}", now)
        outboxScheduler.enqueueMessageSend(clientMessageId)
        dispatchOrQueue(pending)
    }

    override suspend fun votePoll(localId: String, optionIndex: Int, userId: String) {
        withContext(dispatchers.io) {
            val entity = messageDao.getByLocalId(localId) ?: return@withContext
            val current = parseReactions(entity.reactions)
            val updated = current.toMutableMap()
            // Single-choice: drop this user's other poll selections first.
            updated.keys.toList().forEach { key ->
                if (key.startsWith("opt:")) {
                    val users = updated[key].orEmpty().filterNot { it == userId }
                    if (users.isEmpty()) updated.remove(key) else updated[key] = users
                }
            }
            val key = "opt:$optionIndex"
            val wasSelected = current[key]?.contains(userId) == true
            if (!wasSelected) {
                updated[key] = (updated[key].orEmpty() + userId).distinct()
            }
            messageDao.updateReactions(localId, encodeReactions(updated))
            entity.serverMessageId?.let { serverId ->
                runCatching { restApi.updateMessageReactions(serverId, reactionsToJson(updated)) }
            }
        }
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
        if (entity.localMediaPath != null && entity.mediaUrl == null) {
            outboxScheduler.enqueueMediaUpload()
            return@withContext AppResult.Failure(AppError.Validation("Attachment upload is not complete yet."))
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

    override suspend fun scheduleMessage(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        text: String,
        scheduledAt: Long,
    ): AppResult<Message> = withContext(dispatchers.io) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) {
            return@withContext AppResult.Failure(AppError.Validation("Message is empty"))
        }
        val now = timeProvider.nowMillis()
        if (scheduledAt <= now) {
            // A time in the past is meaningless to schedule — just send it now.
            return@withContext sendText(conversationId, senderId, senderName, senderAvatar, trimmed)
        }
        val clientMessageId = idGenerator.newClientMessageId()
        val scheduled = Message(
            localId = clientMessageId,
            clientMessageId = clientMessageId,
            conversationId = conversationId,
            senderId = senderId,
            type = MessageType.TEXT,
            text = trimmed,
            createdAtClient = now,
            status = MessageStatus.SCHEDULED,
            scheduledAt = scheduledAt,
            senderName = senderName,
            senderAvatar = senderAvatar,
        )
        messageDao.upsert(scheduled.toEntity())
        updateConversationPreview(conversationId, clientMessageId, trimmed, now)
        // Durable one-shot job; survives process death and fires when due.
        outboxScheduler.enqueueScheduledMessage(clientMessageId, scheduledAt - now)
        AppResult.Success(scheduled)
    }

    override suspend fun cancelScheduled(localId: String) = withContext(dispatchers.io) {
        val entity = messageDao.getByLocalId(localId) ?: return@withContext
        // Only scheduled rows can be cancelled; never delete a live message.
        if (entity.status != MessageStatus.SCHEDULED.name) return@withContext
        messageDao.deleteScheduled(localId)
        outboxScheduler.cancelScheduledMessage(entity.clientMessageId)
    }

    override suspend fun dispatchScheduled(clientMessageId: String): AppResult<Unit> =
        withContext(dispatchers.io) {
            val entity = messageDao.getByLocalId(clientMessageId)
                ?: return@withContext AppResult.Success(Unit) // cancelled / removed already
            // Idempotency: if it already reached the server, there is nothing to do.
            if (entity.status == MessageStatus.SENT.name || entity.serverMessageId != null) {
                return@withContext AppResult.Success(Unit)
            }
            // Promote out of SCHEDULED (guards against a manual retry racing the worker).
            if (entity.status == MessageStatus.SCHEDULED.name) {
                messageDao.updateStatus(entity.localId, MessageStatus.PENDING.name, null, null)
            }
            val refreshed = messageDao.getByLocalId(clientMessageId) ?: entity
            when (val result = dispatch(refreshed.toDomain())) {
                is AppResult.Success -> AppResult.Success(Unit)
                is AppResult.Failure -> result
                AppResult.Loading -> AppResult.Loading
            }
        }

    override suspend fun editMessage(localId: String, text: String): AppResult<Unit> =
        withContext(dispatchers.io) {
            val entity = messageDao.getByLocalId(localId)
                ?: return@withContext AppResult.Failure(AppError.Validation("Message not found"))
            val serverId = entity.serverMessageId
                ?: return@withContext AppResult.Failure(AppError.Validation("Wait until the message is sent before editing."))
            try {
                restApi.updateMessageText(serverId, text)
                messageDao.updateText(localId, text, timeProvider.nowMillis())
            } catch (t: Throwable) {
                if (t is CancellationException) throw t
                return@withContext AppResult.Failure(ErrorMapper.map(t))
            }
            AppResult.Success(Unit)
        }

    override suspend fun deleteMessage(localId: String): AppResult<Unit> =
        withContext(dispatchers.io) {
            val entity = messageDao.getByLocalId(localId)
                ?: return@withContext AppResult.Failure(AppError.Validation("Message not found"))
            val serverId = entity.serverMessageId
                ?: return@withContext AppResult.Failure(AppError.Validation("Wait until the message is sent before deleting."))
            try {
                restApi.deleteMessage(serverId)
                messageDao.markDeleted(localId, timeProvider.nowMillis())
            } catch (t: Throwable) {
                if (t is CancellationException) throw t
                return@withContext AppResult.Failure(ErrorMapper.map(t))
            }
            AppResult.Success(Unit)
        }

    override suspend fun deleteForMe(localId: String) = withContext(dispatchers.io) {
        messageDao.hideForMe(localId)
    }

    override suspend fun clearConversation(conversationId: String) = withContext(dispatchers.io) {
        messageDao.deleteByConversation(conversationId)
    }

    override suspend fun toggleReaction(
        localId: String,
        emoji: String,
        userId: String,
    ): AppResult<Unit> = withContext(dispatchers.io) {
        val entity = messageDao.getByLocalId(localId)
            ?: return@withContext AppResult.Failure(AppError.Validation("Message not found"))
        val current = parseReactions(entity.reactions)
        val reactors = current[emoji].orEmpty().toMutableSet()
        if (!reactors.add(userId)) reactors.remove(userId)
        val updated = current.toMutableMap()
        if (reactors.isEmpty()) updated.remove(emoji) else updated[emoji] = reactors.toList()
        messageDao.updateReactions(localId, encodeReactions(updated))
        entity.serverMessageId?.let { serverId ->
            runCatching { restApi.updateMessageReactions(serverId, reactionsToJson(updated)) }
        }
        AppResult.Success(Unit)
    }

    override suspend fun sendContact(
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
        contactName: String,
        contactPhone: String?,
    ): AppResult<Message> = withContext(dispatchers.io) {
        val clientMessageId = idGenerator.newClientMessageId()
        val now = timeProvider.nowMillis()
        val pending = Message(
            localId = clientMessageId,
            clientMessageId = clientMessageId,
            conversationId = conversationId,
            senderId = senderId,
            type = MessageType.CONTACT,
            text = contactName,
            contactName = contactName,
            contactPhone = contactPhone,
            createdAtClient = now,
            status = MessageStatus.PENDING,
            senderName = senderName,
            senderAvatar = senderAvatar,
        )
        messageDao.upsert(pending.toEntity())
        updateConversationPreview(conversationId, clientMessageId, "\uD83D\uDC64 $contactName", now)
        outboxScheduler.enqueueMessageSend(clientMessageId)
        dispatchOrQueue(pending)
    }

    override suspend fun forwardMessage(
        source: Message,
        conversationId: String,
        senderId: String,
        senderName: String?,
        senderAvatar: String?,
    ): AppResult<Message> = withContext(dispatchers.io) {
        val clientMessageId = idGenerator.newClientMessageId()
        val now = timeProvider.nowMillis()
        val originalAuthor = source.forwardedFrom ?: source.senderId
        val pending = Message(
            localId = clientMessageId,
            clientMessageId = clientMessageId,
            conversationId = conversationId,
            senderId = senderId,
            type = source.type,
            text = source.text,
            mediaUrl = source.mediaUrl,
            mediaUrls = source.mediaUrls,
            thumbnailUrl = source.thumbnailUrl,
            mediaMime = source.mediaMime,
            mediaSize = source.mediaSize,
            mediaDurationMs = source.mediaDurationMs,
            latitude = source.latitude,
            longitude = source.longitude,
            contactName = source.contactName,
            contactPhone = source.contactPhone,
            forwardedFrom = originalAuthor,
            createdAtClient = now,
            status = MessageStatus.PENDING,
            senderName = senderName,
            senderAvatar = senderAvatar,
        )
        messageDao.upsert(pending.toEntity())
        val preview = source.text ?: "\uD83D\uDCE4 Forwarded"
        updateConversationPreview(conversationId, clientMessageId, preview, now)
        outboxScheduler.enqueueMessageSend(clientMessageId)
        dispatchOrQueue(pending)
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
        val serverId = record["id"]?.jsonPrimitive?.contentOrNull ?: return@withContext
        val clientId = record["local_id"]?.jsonPrimitive?.contentOrNull
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

    override suspend fun applyRealtimeUpdate(record: JsonObject) = applyRealtimeInsert(record)

    override suspend fun setTyping(conversationId: String, userId: String, isTyping: Boolean) {
        withContext(dispatchers.io) {
            if (conversationId.isBlank() || userId.isBlank()) return@withContext
            // Best-effort: typing is ephemeral, so a failed broadcast is harmless.
            runCatching { restApi.upsertTyping(conversationId, userId, isTyping) }
            Unit
        }
    }

    override suspend fun applyTypingEvent(record: JsonObject) = withContext(dispatchers.io) {
        val chatId = record["chat_id"]?.jsonPrimitive?.contentOrNull ?: return@withContext
        val userId = record["user_id"]?.jsonPrimitive?.contentOrNull ?: return@withContext
        val isTyping = record["is_typing"]?.jsonPrimitive?.contentOrNull?.toBoolean() ?: false
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
                if (messageDao.getByLocalId(pending.localId)?.serverMessageId == null) {
                    messageDao.updateStatus(pending.localId, MessageStatus.PENDING.name, null, null)
                }
                AppResult.Success(pending)
            }
            AppResult.Loading -> AppResult.Success(pending)
        }

    private suspend fun dispatch(pending: Message): AppResult<Message> =
        sendLocks[(pending.localId.hashCode() and Int.MAX_VALUE) % sendLocks.size].withLock {
            val cached = messageDao.getByLocalId(pending.localId)
            if (cached?.serverMessageId != null) return@withLock AppResult.Success(cached.toDomain())
            dispatchLocked(pending)
        }

    private suspend fun dispatchLocked(pending: Message): AppResult<Message> = try {
        val row = restApi.insertMessage(
            MessageInsert(
                clientMessageId = pending.clientMessageId,
                conversationId = pending.conversationId,
                senderId = pending.senderId,
                type = pending.type.name.lowercase(),
                text = pending.text,
                mediaUrl = pending.mediaUrl,
                mediaUrls = pending.mediaUrls
                    .filter { it.startsWith("http") }
                    .takeIf { it.isNotEmpty() }
                    ?: pending.mediaUrl?.let { listOf(it) },
                replyToMessageId = pending.replyToMessageId,
                forwardedFrom = pending.forwardedFrom,
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
        if (t is CancellationException) throw t
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
            // Persist a poster frame URL (videos) so recipients can render a
            // preview without downloading the clip.
            message.thumbnailUrl?.takeIf { it.startsWith("http") }?.let { put("thumbnail", it) }
            if (message.type == MessageType.CONTACT) {
                message.contactName?.let { put("contact_name", it) }
                message.contactPhone?.let { put("contact_phone", it) }
            }
            message.liveExpiresAt?.let { put("live_expires_at", it) }
            if (!message.pollQuestion.isNullOrBlank() && message.pollOptions.isNotEmpty()) {
                putJsonObject("poll") {
                    put("question", message.pollQuestion.orEmpty())
                    putJsonArray("options") { message.pollOptions.forEach { add(JsonPrimitive(it)) } }
                }
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

    private fun recordToMessage(record: JsonObject): Message =
        reactionsJson.decodeFromJsonElement<MessageRow>(record).toDomain()
}
