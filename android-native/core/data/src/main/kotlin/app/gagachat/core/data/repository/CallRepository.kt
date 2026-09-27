package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.IdGenerator
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
}

@Singleton
class DefaultCallRepository @Inject constructor(
    private val callDao: CallDao,
    private val userDao: UserDao,
    private val restApi: SupabaseRestApi,
    private val messageRepository: MessageRepository,
    private val authRepository: AuthRepository,
    private val idGenerator: IdGenerator,
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

            rows.forEach { row ->
                val peerId = peerIdOf(row, me)
                val peer = peerId?.let { usersById[it] }
                callDao.upsert(
                    row.toDomain(
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
