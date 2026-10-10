package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.data.preferences.CallHistoryPreferences
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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.first
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

    suspend fun markConnected(callId: String)
    suspend fun endCall(callId: String, status: CallStatus, durationMs: Long?)
    suspend fun syncHistory()

    /** Removes a single entry from the local call history. */
    suspend fun deleteCall(callId: String)

    /** Clears the entire local call history. */
    suspend fun clearHistory()
}

@Singleton
@OptIn(ExperimentalCoroutinesApi::class)
class DefaultCallRepository @Inject constructor(
    private val callDao: CallDao,
    private val userDao: UserDao,
    private val restApi: SupabaseRestApi,
    private val messageRepository: MessageRepository,
    private val conversationRepository: ConversationRepository,
    private val authRepository: AuthRepository,
    private val timeProvider: TimeProvider,
    private val dispatchers: DispatcherProvider,
    private val hiddenCalls: CallHistoryPreferences,
) : CallRepository {

    override fun observeHistory(): Flow<List<CallSession>> =
        authRepository.sessionFlow.flatMapLatest { owner ->
        if (owner == null) return@flatMapLatest flowOf(emptyList<CallSession>())
        combine(callDao.observeHistory(100), userDao.observeAll(), hiddenCalls.observe(owner.userId)) { calls, users, hidden ->
            val usersById = users.associate { it.id to it.toDomain() }
            calls.filter { it.id !in hidden }.map { entity ->
                val session = entity.toDomain()
                val peer = session.peerId?.let { usersById[it] }
                if (peer != null) {
                    session.copy(
                        peerName = session.peerName?.takeIf { it.isNotBlank() } ?: peer.displayLabel,
                        peerAvatar = peer.avatar,
                    )
                } else {
                    session
                }
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
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun markConnected(callId: String) = withContext(dispatchers.io) {
        restApi.markCallConnected(callId)
    }

    override suspend fun endCall(callId: String, status: CallStatus, durationMs: Long?) =
        withContext(dispatchers.io) {
            val now = timeProvider.nowMillis()
            callDao.finalize(callId, status.name, now, durationMs)
            runCatching {
                restApi.updateCallHistory(callId, status.name.lowercase(), now, durationMs)
            }
            // Persist a CALL_EVENT into chat history. Only the *initiator* writes
            // it: both parties run this finalize path, and the callee's row (once
            // history has synced) would otherwise produce a second, identical
            // bubble in the shared conversation. The server's local_id dedupe
            // cannot help here because each device mints its own client id.
            val session = callDao.getById(callId)?.toDomain()
            if (session != null && session.isOutgoing) {
                messageRepository.sendCallEvent(
                    conversationId = session.conversationId,
                    senderId = session.initiatorId,
                    text = callEventText(session, status, durationMs),
                )
            }
        }

    override suspend fun syncHistory() = withContext(dispatchers.io) {        runCatching {
            val me = authRepository.sessionFlow.value?.userId.orEmpty()
            if (me.isBlank()) return@runCatching
            val hidden = hiddenCalls.hidden(me)
            val rows = restApi.getCallHistory(100).filter { it.id !in hidden }

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

            if (me != authRepository.sessionFlow.value?.userId) return@runCatching
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
        }.getOrThrow()
        Unit
    }

    override suspend fun deleteCall(callId: String) = withContext(dispatchers.io) {
        val owner = requireNotNull(authRepository.sessionFlow.value?.userId) { "Please sign in again" }
        hiddenCalls.hide(owner, setOf(callId))
        callDao.deleteById(callId)
    }

    override suspend fun clearHistory() = withContext(dispatchers.io) {
        val owner = requireNotNull(authRepository.sessionFlow.value?.userId) { "Please sign in again" }
        val ids = callDao.observeHistory(100).first().map { it.id }.toSet()
        hiddenCalls.hide(owner, ids)
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

    /**
     * Human-readable CALL_EVENT line. The wording is deliberately stable so the
     * chat bubble can parse the outcome back out of [Message.text]: only a
     * connected call carries the "\u2022 duration" suffix, so its presence is the
     * "was answered" signal (P0).
     */
    private fun callEventText(session: CallSession, status: CallStatus, durationMs: Long?): String {
        val kind = if (session.type == CallType.VIDEO) "video call" else "voice call"
        val answered = status == CallStatus.ENDED && (durationMs ?: 0L) > 0L
        return when {
            answered -> {
                val secs = (durationMs ?: 0L) / 1000
                "Answered $kind \u2022 ${secs / 60}m ${secs % 60}s"
            }
            status == CallStatus.MISSED -> "Missed $kind"
            status == CallStatus.BUSY -> "Busy $kind"
            status == CallStatus.REJECTED -> "Declined $kind"
            status == CallStatus.FAILED -> "Failed $kind"
            status == CallStatus.ENDED && session.isOutgoing -> "Cancelled $kind"
            else -> "Missed $kind"
        }
    }
}
