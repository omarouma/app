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
import app.gagachat.core.network.dto.MessageInsert
import app.gagachat.core.network.dto.MessageReceiptRow
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Message access implementing the local-first, optimistic, idempotent send
 * pipeline from PDF §5.1–§5.3.
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

    suspend fun retry(localId: String): AppResult<Unit>
    suspend fun editMessage(localId: String, text: String): AppResult<Unit>
    suspend fun deleteMessage(localId: String): AppResult<Unit>
    suspend fun markDelivered(conversationId: String, userId: String)
    suspend fun markRead(conversationId: String, userId: String)

    suspend fun applyRealtimeInsert(record: JsonObject)
    suspend fun applyRealtimeUpdate(record: JsonObject)
}

@Singleton
class DefaultMessageRepository @Inject constructor(
    private val messageDao: MessageDao,
    private val conversationDao: ConversationDao,
    private val syncStateDao: SyncStateDao,
    private val restApi: SupabaseRestApi,
    private val idGenerator: IdGenerator,
    private val timeProvider: TimeProvider,
    private val dispatchers: DispatcherProvider,
) : MessageRepository {

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
                val now = timeProvider.nowMillis()
                rows.map { it.toDomain() }.forEach { remote ->
                    val local = messageDao.getByServerMessageId(remote.serverMessageId ?: "")
                        ?: messageDao.getByClientMessageId(remote.clientMessageId)
                    if (local == null || SyncPolicy.shouldApplyRemote(local.status)) {
                        messageDao.upsert(remote.toEntity())
                    }
                }
                syncStateDao.upsert(SyncStateEntity(key, now, null))
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

        // Step 1-3: write exactly ONE local pending row and show it immediately.
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

        // Step 4-5: send with idempotency key; server ACK updates the same row.
        dispatch(pending)
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
        updateConversationPreview(conversationId, clientMessageId, "📍 Location", now)
        dispatch(pending)
    }

    override suspend fun retry(localId: String): AppResult<Unit> = withContext(dispatchers.io) {
        val entity = messageDao.getByLocalId(localId)
            ?: return@withContext AppResult.Failure(AppError.Validation("Message not found"))
        messageDao.updateStatus(localId, MessageStatus.PENDING.name, null, null)
        dispatch(entity.toDomain())
        AppResult.Success(Unit)
    }

    override suspend fun editMessage(localId: String, text: String): AppResult<Unit> =
        withContext(dispatchers.io) {
            val entity = messageDao.getByLocalId(localId)
                ?: return@withContext AppResult.Failure(AppError.Validation("Message not found"))
            val now = timeProvider.nowMillis()
            messageDao.updateText(localId, text, now)
            entity.serverMessageId?.let { serverId ->
                runCatching { restApi.updateMessageText(serverId, text, now) }
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
                runCatching { restApi.deleteMessage(serverId, now) }
            }
            AppResult.Success(Unit)
        }

    override suspend fun markDelivered(conversationId: String, userId: String) =
        withContext(dispatchers.io) {
            val messages = messageDao.getLatest(conversationId, Constants.INITIAL_MESSAGE_PAGE_SIZE)
            val now = timeProvider.nowMillis()
            messages.filter { it.senderId != userId }.forEach { m ->
                m.serverMessageId?.let { id ->
                    runCatching {
                        restApi.upsertReceipt(MessageReceiptRow(id, userId, deliveredAt = now))
                    }
                }
            }
        }

    override suspend fun markRead(conversationId: String, userId: String) =
        withContext(dispatchers.io) {
            val messages = messageDao.getLatest(conversationId, Constants.INITIAL_MESSAGE_PAGE_SIZE)
            val now = timeProvider.nowMillis()
            messages.filter { it.senderId != userId }.forEach { m ->
                m.serverMessageId?.let { id ->
                    runCatching {
                        restApi.upsertReceipt(MessageReceiptRow(id, userId, deliveredAt = now, readAt = now))
                    }
                }
            }
            conversationDao.updateUnreadCount(conversationId, 0)
        }

    override suspend fun applyRealtimeInsert(record: JsonObject) = withContext(dispatchers.io) {
        val serverId = record["id"]?.jsonPrimitive?.content ?: return@withContext
        val clientId = record["client_message_id"]?.jsonPrimitive?.content
        // Deduplicate: if we already have this row (by client or server id), update it.
        val existing = messageDao.getByServerMessageId(serverId)
            ?: clientId?.let { messageDao.getByClientMessageId(it) }
        val remote = recordToMessage(record)
        if (existing == null) {
            messageDao.upsert(remote.toEntity())
        } else if (SyncPolicy.shouldApplyRemote(existing.status)) {
            messageDao.upsert(remote.copy(localId = existing.localId).toEntity())
        } else {
            // Our own optimistic row: just attach the server id + timestamp.
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

    // ---- internals ----

    private suspend fun dispatch(pending: Message): AppResult<Message> = try {
        val row = restApi.insertMessage(
            MessageInsert(
                clientMessageId = pending.clientMessageId,
                conversationId = pending.conversationId,
                senderId = pending.senderId,
                type = pending.type.name.lowercase(),
                text = pending.text,
                mediaUrl = pending.mediaUrl,
                thumbnailUrl = pending.thumbnailUrl,
                replyToMessageId = pending.replyToMessageId,
                latitude = pending.latitude,
                longitude = pending.longitude,
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
        fun long(key: String) = record[key]?.jsonPrimitive?.content?.toLongOrNull()
        fun dbl(key: String) = record[key]?.jsonPrimitive?.content?.toDoubleOrNull()
        val serverId = str("id") ?: ""
        val clientId = str("client_message_id") ?: serverId
        return Message(
            localId = clientId,
            clientMessageId = clientId,
            serverMessageId = serverId,
            conversationId = str("conversation_id") ?: "",
            senderId = str("sender_id") ?: "",
            type = str("type")?.let { runCatching { MessageType.valueOf(it.uppercase()) }.getOrNull() }
                ?: MessageType.TEXT,
            text = str("text"),
            mediaUrl = str("media_url"),
            thumbnailUrl = str("thumbnail_url"),
            replyToMessageId = str("reply_to_message_id"),
            createdAtClient = long("created_at") ?: 0L,
            createdAtServer = long("created_at"),
            status = MessageStatus.SENT,
            editedAt = long("edited_at"),
            deletedAt = long("deleted_at"),
            latitude = dbl("latitude"),
            longitude = dbl("longitude"),
        )
    }
}
