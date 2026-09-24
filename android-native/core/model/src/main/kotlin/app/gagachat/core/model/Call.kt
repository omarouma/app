package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Call session (PDF §7.1 `call_sessions`, §8). The same server session id is used
 * by both call history and the CALL_EVENT chat item.
 */
@Serializable
data class CallSession(
    val id: String,
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("initiator_id") val initiatorId: String,
    val type: CallType = CallType.AUDIO,
    @SerialName("started_at") val startedAt: Long = 0L,
    @SerialName("ended_at") val endedAt: Long? = null,
    val status: CallStatus = CallStatus.RINGING,
    @SerialName("peer_id") val peerId: String? = null,
    @SerialName("peer_name") val peerName: String? = null,
    @SerialName("peer_avatar") val peerAvatar: String? = null,
    @SerialName("duration_ms") val durationMs: Long? = null,
    @SerialName("is_outgoing") val isOutgoing: Boolean = false,
)

@Serializable
enum class CallType {
    @SerialName("audio") AUDIO,
    @SerialName("video") VIDEO,
}

@Serializable
enum class CallStatus {
    @SerialName("ringing") RINGING,
    @SerialName("connecting") CONNECTING,
    @SerialName("connected") CONNECTED,
    @SerialName("ended") ENDED,
    @SerialName("missed") MISSED,
    @SerialName("rejected") REJECTED,
    @SerialName("busy") BUSY,
    @SerialName("failed") FAILED,
}

/**
 * Signaling payload exchanged over the realtime channel (PDF §8 — media path and
 * signaling are kept separate).
 */
@Serializable
data class CallSignal(
    @SerialName("call_id") val callId: String,
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("from_user_id") val fromUserId: String,
    @SerialName("to_user_id") val toUserId: String,
    val kind: CallSignalKind,
    val payload: String? = null,
    @SerialName("created_at") val createdAt: Long = 0L,
)

@Serializable
enum class CallSignalKind {
    @SerialName("offer") OFFER,
    @SerialName("answer") ANSWER,
    @SerialName("ice") ICE_CANDIDATE,
    @SerialName("ringing") RINGING,
    @SerialName("accept") ACCEPT,
    @SerialName("reject") REJECT,
    @SerialName("busy") BUSY,
    @SerialName("hangup") HANGUP,
}
