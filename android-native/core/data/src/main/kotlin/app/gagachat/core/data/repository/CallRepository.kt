package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.data.mapper.toDomain
import app.gagachat.core.database.dao.CallDao
import app.gagachat.core.database.dao.UserDao
import app.gagachat.core.database.mapper.toDomain
import app.gagachat.core.database.mapper.toEntity
import app.gagachat.core.model.CallSession
import app.gagachat.core.model.CallStatus
import app.gagachat.core.model.CallType
import app.gagachat.core.model.User
import app.gagachat.core.network.dto.CallHistoryRow
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Call subsystem. Call history and the CALL_EVENT chat item share the same
 * server session id.
 */
interface CallRepository {
    fun observeHistory(): Flow<List<CallSession>>
    suspend fun startCall(
        conversationId: String,
        initiatorId: String,
        peerId: String?,
        peerName: String?,
        peerAvatar: String?,
        type: CallType,
    ): AppResult<CallSession>

    suspend fun endCall(callId: String, status: CallStatus, durationMs: Long?)
    suspend fun syncHistory()

    /** Removes a single entry from the local call history. */
    suspend fun deleteCall(callId: String)

    /** Clears the entire local call history. */
    suspend fun clearHistory()
}

@Singleton
class DefaultCallRepository @Inject constructor(
    private val callDao: CallDao,
    private val userDao: UserDao,
    private val restApi: SupabaseRestApi,
    private val messageRepository: MessageRepository,
    private val conversationRepository: ConversationRepository,
    private val authRepository: AuthRepository,
    private val timeProvider: TimeProvider,
    private val dispatchers: DispatcherProvider,
) : CallRepository {

    override fun observeHistory(): Flow<List<CallSession>> =
        combine(callDao.observeHistory(100), userDao.observeAll()) { calls, users ->
            val usersById = users.associate { it.id to it.toDomain() }
            calls.map { entity ->
                val session = entity.toDomain()
                val peer = session.peerId?.let { usersById[it] }
                if (peer != null) {
                    session.copy(
                        peerName = session.peerName?.takeIf { it.isNotBlank() } ?: peer.displayLabel,
                        peerAvatar = session.peerAvatar ?: peer.avatar,
                    )
                } else {
                    session
                }
            }
        }

    override suspend fun startCall(
        conversationId: String,
        initiatorId: String,
        peerId: String?,
        peerName: String?,
        peerAvatar: String?,
        type: CallType,
    ): AppResult<CallSession> = withContext(dispatchers.io) {
        if (peerId.isNullOrBlank()) {
            return@withContext AppResult.Failure(AppError.Validation("This conversation has no callable peer."))
        }
        if (conversationId.isBlank()) {
            return@withContext AppResult.Failure(AppError.Validation("Missing conversation id."))
        }

        try {
            val response = restApi.createCall(
                conversationId = conversationId,
                calleeId = peerId,
                type = if (type == CallType.VIDEO) "video" else "voice",
            )
            val now = timeProvider.nowMillis()
            val session = CallSession(
                id = response.callId,
                conversationId = conversationId,
                initiatorId = initiatorId,
                type = type,
                startedAt = now,
                status = CallStatus.RINGING,
                peerId = peerId,
                peerName = peerName,
                peerAvatar = peerAvatar,
                isOutgoing = true,
            )
            callDao.upsert(session.toEntity())
            AppResult.Success(session)
        } catch (t: Throwable) {
            if (t is kotlinx.coroutines.CancellationException) throw t
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun endCall(callId: String, status: CallStatus, durationMs: Long?) =
        withContext(dispatchers.io) {
            val previous = callDao.getById(callId)?.toDomain()
            if (previous?.endedAt != null) return@withContext
            val now = timeProvider.nowMillis()
            callDao.finalize(callId, status.name, now, durationMs)
            runCatching {
                restApi.finishCall(callId, status.name.lowercase(), (durationMs ?: 0L) / 1000L)
            }
            // Persist a CALL_EVENT into chat history.
            val session = callDao.getById(callId)?.toDomain()
            if (session != null && session.initiatorId == authRepository.sessionFlow.value?.userId) {
                messageRepository.sendCallEvent(
                    conversationId = session.conversationId,
                    senderId = session.initiatorId,
                    text = callEventText(session, status, durationMs),
                )
            }
        }

    override suspend fun syncHistory() = withContext(dispatchers.io) {        runCatching {
            val me = authRepository.sessionFlow.value?.userId.orEmpty()
            val rows = restApi.getCallHistory(100)

            // Resolve every peer id in one batch and cache the profiles so the
            // call list renders real identities (never "Unknown User").
            val peerIds = rows.mapNotNull { peerIdOf(it, me) }.distinct()
            val usersById: Map<String, User> = if (peerIds.isEmpty()) {
                emptyMap()
            } else {
                runCatching {
                    val users = restApi.getUsers(peerIds).map { it.toDomain() }
                    if (users.isNotEmpty()) {
                        userDao.upsertAll(users.map { it.toEntity(timeProvider.nowMillis()) })
                    }
                    users.associateBy { it.id }
                }.getOrDefault(emptyMap())
            }

            // Prefer the durable `chat_id` from call_history. For legacy rows that
            // predate that column, reconstruct the direct conversation from the peer.
            val conversationByPeer = mutableMapOf<String, String>()
            if (me.isNotBlank()) {
                val legacyPeers = rows
                    .filter { it.conversationId.isNullOrBlank() }
                    .mapNotNull { peerIdOf(it, me) }
                    .distinct()
                legacyPeers.forEach { peer ->
                    runCatching {
                        when (val opened = conversationRepository.openDirectConversation(me, peer)) {
                            is AppResult.Success -> conversationByPeer[peer] = opened.data
                            is AppResult.Failure -> Unit
                            AppResult.Loading -> Unit
                        }
                    }
                }
            }

            rows.forEach { row ->
                val peerId = peerIdOf(row, me)
                val peer = peerId?.let { usersById[it] }
                callDao.upsert(
                    row.toDomain(
                        conversationId = peerId?.let { conversationByPeer[it] },
                        peerId = peerId,
                        peerName = peer?.displayLabel,
                        peerAvatar = peer?.avatar,
                        isOutgoing = me.isNotBlank() && row.callerId == me,
                    ).toEntity(),
                )
            }
        }
        Unit
    }

    override suspend fun deleteCall(callId: String) = withContext(dispatchers.io) {
        callDao.deleteById(callId)
    }

    override suspend fun clearHistory() = withContext(dispatchers.io) {
        callDao.deleteAll()
    }

    /** The other participant of a call relative to the signed-in user. */
    private fun peerIdOf(row: CallHistoryRow, me: String): String? = when {
        me.isNotBlank() && row.callerId == me -> row.calleeId
        me.isNotBlank() && row.calleeId == me -> row.callerId
        else -> row.participantIds?.firstOrNull { it.isNotBlank() && it != me }
            ?: row.calleeId
            ?: row.callerId
    }

    private fun callEventText(session: CallSession, status: CallStatus, durationMs: Long?): String {
        val kind = if (session.type == CallType.VIDEO) "Video call" else "Voice call"
        return when (status) {
            CallStatus.MISSED -> "Missed $kind"
            CallStatus.REJECTED -> "Declined $kind"
            CallStatus.BUSY -> "Missed $kind (busy)"
            else -> {
                val secs = (durationMs ?: 0L) / 1000
                "$kind \u2022 ${secs / 60}m ${secs % 60}s"
            }
        }
    }
}

