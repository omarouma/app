package app.gagachat.core.network.realtime

import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.webSocketSession
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import io.ktor.websocket.send
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Minimal Supabase Realtime (Phoenix channels) client over WebSocket.
 *
 * Design goals (PDF §4, §7, §9.1):
 *  - A single shared connection multiplexes all table subscriptions.
 *  - Delta events only; the client never re-fetches full datasets.
 *  - Automatic reconnect with exponential backoff.
 *  - Duplicate listeners are prevented by keying subscriptions by topic.
 */
@Singleton
class SupabaseRealtimeClient @Inject constructor(
    private val client: HttpClient,
    private val config: SupabaseConfig,
    private val sessionStore: SessionStore,
    private val logger: AppLogger,
) {

    private val json = Json { ignoreUnknownKeys = true }

    private val _events = MutableSharedFlow<RealtimeEvent>(
        replay = 0,
        extraBufferCapacity = 256,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val events: SharedFlow<RealtimeEvent> = _events.asSharedFlow()

    private var connectionJob: Job? = null
    private var scope: CoroutineScope? = null
    private var activeSession: DefaultClientWebSocketSession? = null
    private val activeTopics = mutableSetOf<String>()
    private var refCounter = 0

    @Synchronized
    fun connect(scope: CoroutineScope) {
        this.scope = scope
        if (connectionJob?.isActive == true) return
        connectionJob = scope.launch { runConnectionLoop() }
    }

    @Synchronized
    fun disconnect() {
        connectionJob?.cancel()
        connectionJob = null
        activeTopics.clear()
    }

    /**
     * Subscribe to postgres changes for a table, optionally filtered. Duplicate
     * subscriptions for the same topic are ignored (PDF §4 — no duplicate listeners).
     */
    @Synchronized
    fun subscribe(table: String, filter: String? = null) {
        val topic = topicFor(table, filter)
        if (!activeTopics.add(topic)) return
        val currentScope = scope ?: return
        connect(currentScope)
        // If a connection is already live, join immediately; otherwise the
        // connection loop joins every active topic when it (re)connects.
        val session = activeSession
        if (session != null) {
            currentScope.launch {
                runCatching { session.send(Frame.Text(joinMessage(topic))) }
            }
        }
    }

    /** Leave a topic and stop receiving its deltas. */
    @Synchronized
    fun unsubscribe(table: String, filter: String? = null) {
        val topic = topicFor(table, filter)
        if (!activeTopics.remove(topic)) return
        val session = activeSession ?: return
        val currentScope = scope ?: return
        currentScope.launch {
            runCatching { session.send(Frame.Text(leaveMessage(topic))) }
        }
    }

    /**
     * Joins a raw broadcast topic (no postgres_changes binding). Used by the
     * WebRTC signaling channel, which exchanges ephemeral offer/answer/ICE
     * payloads over `broadcast` rather than the table stream (PDF §8).
     */
    @Synchronized
    fun subscribeBroadcast(topic: String) {
        if (!activeTopics.add(topic)) return
        val currentScope = scope ?: return
        connect(currentScope)
        val session = activeSession
        if (session != null) {
            currentScope.launch {
                runCatching { session.send(Frame.Text(joinBroadcastMessage(topic))) }
            }
        }
    }

    /** Leaves a raw broadcast topic. */
    @Synchronized
    fun unsubscribeBroadcast(topic: String) {
        if (!activeTopics.remove(topic)) return
        val session = activeSession ?: return
        val currentScope = scope ?: return
        currentScope.launch {
            runCatching { session.send(Frame.Text(leaveMessage(topic))) }
        }
    }

    /**
     * Sends a broadcast message on [topic]. Fire-and-forget: if the socket is
     * not yet connected the message is dropped, and the caller retries on the
     * next signaling tick (signaling is idempotent by design).
     */
    @Synchronized
    fun broadcast(topic: String, event: String, payload: JsonObject) {
        val session = activeSession ?: return
        val currentScope = scope ?: return
        val message = buildJsonObject {
            put("topic", topic)
            put("event", "broadcast")
            put("payload", buildJsonObject {
                put("type", "broadcast")
                put("event", event)
                put("payload", payload)
            })
            put("ref", (++refCounter).toString())
        }.toString()
        currentScope.launch {
            runCatching { session.send(Frame.Text(message)) }
        }
    }

    private fun topicFor(table: String, filter: String?): String =
        if (filter.isNullOrBlank()) "realtime:public:$table" else "realtime:public:$table:$filter"

    private suspend fun runConnectionLoop() {
        var backoff = 1_000L
        while (true) {
            try {
                val url = "${config.realtimeUrl}?apikey=${config.anonKey}&vsn=1.0.0"
                val session = client.webSocketSession(url)
                try {
                    logger.i(TAG, "Realtime connected")
                    backoff = 1_000L
                    activeSession = session
                    // Join all currently active topics.
                    activeTopics.toList().forEach { topic ->
                        session.send(Frame.Text(joinMessage(topic)))
                    }
                    // Heartbeat loop. `session` is a CoroutineScope, so the
                    // heartbeat is scoped to the lifetime of the connection.
                    val heartbeat = session.launch {
                        while (isActive) {
                            delay(25_000)
                            session.send(Frame.Text(heartbeatMessage()))
                        }
                    }
                    for (frame in session.incoming) {
                        if (frame is Frame.Text) {
                            handleFrame(frame.readText())
                        }
                    }
                    heartbeat.cancel()
                } finally {
                    activeSession = null
                    runCatching { session.close() }
                }
            } catch (t: Throwable) {
                activeSession = null
                logger.w(TAG, "Realtime disconnected: ${t.message}")
                _events.tryEmit(RealtimeEvent.ConnectionError(t.message ?: "disconnected"))
            }
            delay(backoff)
            backoff = (backoff * 2).coerceAtMost(30_000L)
        }
    }

    private fun handleFrame(text: String) {
        val obj = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return
        val event = obj["event"]?.jsonPrimitive?.content ?: return
        val topic = obj["topic"]?.jsonPrimitive?.content ?: ""
        when (event) {
            "phx_reply" -> {
                val status = obj["payload"]?.jsonObject?.get("status")?.jsonPrimitive?.content
                if (status == "ok") _events.tryEmit(RealtimeEvent.Subscribed(topic))
                else _events.tryEmit(RealtimeEvent.Failure(topic, status ?: "error"))
            }
            "postgres_changes" -> parsePostgresChange(obj)
            "broadcast" -> parseBroadcast(topic, obj)
            "phx_error", "phx_close" -> _events.tryEmit(RealtimeEvent.Unsubscribed(topic))
        }
    }

    private fun parseBroadcast(topic: String, obj: JsonObject) {
        val payload = obj["payload"]?.jsonObject ?: return
        val event = payload["event"]?.jsonPrimitive?.content ?: return
        val data = payload["payload"]?.jsonObject ?: JsonObject(emptyMap())
        _events.tryEmit(RealtimeEvent.Broadcast(topic, event, data))
    }

    private fun parsePostgresChange(obj: JsonObject) {
        val data = obj["payload"]?.jsonObject?.get("data")?.jsonObject ?: return
        val type = data["type"]?.jsonPrimitive?.content ?: return
        val table = data["table"]?.jsonPrimitive?.content ?: return
        val record = data["record"]?.jsonObject ?: JsonObject(emptyMap())
        val oldRecord = data["old_record"]?.jsonObject
        val changeType = runCatching { ChangeType.valueOf(type.uppercase()) }.getOrNull() ?: return
        _events.tryEmit(RealtimeEvent.PostgresChange(table, changeType, record, oldRecord))
    }

    private fun joinMessage(topic: String): String {
        val table = topic.substringAfterLast("public:").substringBefore(":")
        val filter = topic.substringAfter("$table:", "").takeIf { it.isNotBlank() }
        val payload = buildJsonObject {
            putJsonObject("config") {
                putJsonObject("broadcast") { put("self", false) }
                putJsonObject("presence") { put("key", "") }
                putJsonArray("postgres_changes") {
                    add(
                        buildJsonObject {
                            put("event", "*")
                            put("schema", "public")
                            put("table", table)
                            if (filter != null) put("filter", filter)
                        },
                    )
                }
            }
            sessionStore.accessToken()?.let { put("access_token", it) }
        }
        return buildJsonObject {
            put("topic", topic)
            put("event", "phx_join")
            put("payload", payload)
            put("ref", (++refCounter).toString())
        }.toString()
    }

    private fun joinBroadcastMessage(topic: String): String {
        val payload = buildJsonObject {
            putJsonObject("config") {
                putJsonObject("broadcast") { put("self", false) }
                putJsonObject("presence") { put("key", "") }
            }
            sessionStore.accessToken()?.let { put("access_token", it) }
        }
        return buildJsonObject {
            put("topic", topic)
            put("event", "phx_join")
            put("payload", payload)
            put("ref", (++refCounter).toString())
        }.toString()
    }

    private fun leaveMessage(topic: String): String = buildJsonObject {
        put("topic", topic)
        put("event", "phx_leave")
        put("payload", buildJsonObject {})
        put("ref", (++refCounter).toString())
    }.toString()

    private fun heartbeatMessage(): String = buildJsonObject {
        put("topic", "phoenix")
        put("event", "heartbeat")
        put("payload", buildJsonObject {})
        put("ref", (++refCounter).toString())
    }.toString()

    private companion object {
        const val TAG = "Realtime"
    }
}
