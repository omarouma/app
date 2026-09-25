package app.gagachat.core.data.call

import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.model.CallSignal
import app.gagachat.core.model.CallSignalKind
import app.gagachat.core.network.realtime.RealtimeEvent
import app.gagachat.core.network.realtime.SupabaseRealtimeClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Supabase Realtime broadcast-backed signaling transport (PDF §8).
 *
 * Signals are ephemeral: they ride the `broadcast` channel of a per-call topic
 * (`call:<callId>`) rather than the postgres table stream, so no call-signaling
 * rows are ever persisted. The [SupabaseRealtimeClient] already multiplexes a
 * single WebSocket and reconnects with backoff, so signaling inherits that
 * resilience for free.
 */
@Singleton
class SupabaseCallSignaling @Inject constructor(
    private val realtime: SupabaseRealtimeClient,
    private val logger: AppLogger,
) : CallSignaling {

    private val json = Json { ignoreUnknownKeys = true }

    override fun subscribe(callId: String): Flow<CallSignal> {
        val topic = topicFor(callId)
        realtime.subscribeBroadcast(topic)
        return realtime.events
            .filterIsInstance<RealtimeEvent.Broadcast>()
            .mapNotNull { event ->
                if (event.topic != topic) return@mapNotNull null
                decode(event.payload.toString())
            }
    }

    override suspend fun send(signal: CallSignal) {
        val topic = topicFor(signal.callId)
        val payload = buildJsonObject {
            put("call_id", signal.callId)
            put("conversation_id", signal.conversationId)
            put("from_user_id", signal.fromUserId)
            put("to_user_id", signal.toUserId)
            put("kind", signal.kind.name.lowercase())
            signal.payload?.let { put("payload", it) }
            put("created_at", signal.createdAt)
        }
        realtime.broadcast(topic, "signal", payload)
    }

    override fun unsubscribe(callId: String) {
        realtime.unsubscribeBroadcast(topicFor(callId))
    }

    private fun decode(raw: String): CallSignal? = runCatching {
        val obj = json.parseToJsonElement(raw).let { it as? kotlinx.serialization.json.JsonObject }
            ?: return@runCatching null
        val kind = obj["kind"]?.jsonPrimitive?.content
            ?.let { runCatching { CallSignalKind.valueOf(it.uppercase()) }.getOrNull() }
            ?: return@runCatching null
        CallSignal(
            callId = obj["call_id"]?.jsonPrimitive?.content ?: return@runCatching null,
            conversationId = obj["conversation_id"]?.jsonPrimitive?.content ?: "",
            fromUserId = obj["from_user_id"]?.jsonPrimitive?.content ?: "",
            toUserId = obj["to_user_id"]?.jsonPrimitive?.content ?: "",
            kind = kind,
            payload = obj["payload"]?.jsonPrimitive?.content,
            createdAt = obj["created_at"]?.jsonPrimitive?.content?.toLongOrNull() ?: 0L,
        )
    }.onFailure { logger.w(TAG, "Bad call signal: ${it.message}") }.getOrNull()

    private companion object {
        const val TAG = "CallSignaling"
    }
}
