package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.IdGenerator
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.data.mapper.toDomain
import app.gagachat.core.database.dao.CallDao
import app.gagachat.core.database.mapper.toDomain
import app.gagachat.core.database.mapper.toEntity
import app.gagachat.core.model.CallSession
import app.gagachat.core.model.CallStatus
import app.gagachat.core.model.CallType
import app.gagachat.core.network.dto.CallHistoryRow
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
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
}

@Singleton
class DefaultCallRepository @Inject constructor(
    private val callDao: CallDao,
    private val restApi: SupabaseRestApi,
    private val messageRepository: MessageRepository,
    private val idGenerator: IdGenerator,
    private val timeProvider: TimeProvider,
    private val dispatchers: DispatcherProvider,
) : CallRepository {

    override fun observeHistory(): Flow<List<CallSession>> =
        callDao.observeHistory(100).map { list -> list.map { it.toDomain() } }

    override suspend fun startCall(
        conversationId: String,
        initiatorId: String,
        peerId: String?,
        peerName: String?,
        peerAvatar: String?,
        type: CallType,
    ): AppResult<CallSession> = withContext(dispatchers.io) {
        val now = timeProvider.nowMillis()
        val callId = idGenerator.newUuid()
        val session = CallSession(
            id = callId,
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
        // call_history.callee_id is NOT NULL, so a server row needs a known peer.
        if (peerId != null) {
            runCatching {
                restApi.insertCallHistory(
                    CallHistoryRow(
                        id = callId,
                        conversationId = conversationId,
                        callerId = initiatorId,
                        calleeId = peerId,
                        type = type.name.lowercase(),
                        status = CallStatus.RINGING.name.lowercase(),
                        roomId = callId,
                        startedAt = now,
                    ),
                )
            }
        }
        AppResult.Success(session)
    }

    override suspend fun endCall(callId: String, status: CallStatus, durationMs: Long?) =
        withContext(dispatchers.io) {
            val now = timeProvider.nowMillis()
            callDao.finalize(callId, status.name, now, durationMs)
            runCatching {
                restApi.updateCallHistory(callId, status.name.lowercase(), now, durationMs)
            }
            // Persist a CALL_EVENT into chat history.
            val session = callDao.getById(callId)?.toDomain()
            if (session != null) {
                messageRepository.sendCallEvent(
                    conversationId = session.conversationId,
                    senderId = session.initiatorId,
                    text = callEventText(session, status, durationMs),
                )
            }
        }

    override suspend fun syncHistory() = withContext(dispatchers.io) {
        runCatching {
            val rows = restApi.getCallHistory(100)
            rows.forEach { callDao.upsert(it.toDomain().toEntity()) }
        }
        Unit
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
