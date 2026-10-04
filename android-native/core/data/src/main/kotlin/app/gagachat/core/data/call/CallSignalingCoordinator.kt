package app.gagachat.core.data.call

import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.model.CallSignal
import app.gagachat.core.model.CallSignalKind
import app.gagachat.core.network.realtime.RealtimeEvent
import app.gagachat.core.network.realtime.SupabaseRealtimeClient
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Call invite + ring/accept/reject/hang-up signalling over the Supabase Realtime
 * broadcast channel (PDF §8 — signalling is deliberately kept off the postgres
 * table stream).
 *
 * ## Why this exists
 *
 * LiveKit is a pure media transport (an SFU): it tells you *who is in a room*,
 * but it has no concept of "ring this user's phone". The calling stack it
 * replaced bundled its own invite/ring layer, so that layer has to be provided
 * here instead — this class is that replacement.
 *
 * Two topic shapes are used:
 *
 *  - `call:user:<userId>` — a personal *inbox*. Every signed-in client joins its
 *    own inbox for as long as the app process is alive, so a foreground caller
 *    can ring a foreground callee instantly without a push round-trip.
 *  - `call:<callId>` — a per-call *room*. Both parties join it once the call
 *    exists, and it carries the ring-back, accept, reject, busy and hang-up
 *    signals for that one call.
 *
 * ## Security
 *
 * The channels are public Supabase Realtime channels (the same posture as the
 * rest of the app's realtime usage), so treat everything on them as visible to
 * anyone holding the project's anon key. That is why nothing sensitive is ever
 * placed here: the payload carries only a call id, a display name and a
 * video/audio flag. Actual media access is gated by the LiveKit access token,
 * which is minted server-side by the `livekit-token` Edge Function and only
 * after the caller has been proven to be a participant of that call.
 *
 * ## Delivery guarantees
 *
 * Broadcasts are fire-and-forget: if the socket is momentarily down the message
 * is dropped. That is acceptable because signalling is idempotent and
 * self-healing — a missed `RINGING` is recovered by the FCM push (see
 * [app.gagachat.push.GagaFirebaseMessagingService]) and a missed `HANGUP` is
 * recovered by
 * the LiveKit room's own `ParticipantDisconnected` / `Disconnected` events.
 */
@Singleton
class CallSignalingCoordinator @Inject constructor(
    private val realtime: SupabaseRealtimeClient,
    private val logger: AppLogger,
) {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _signals = MutableSharedFlow<CallSignal>(
        replay = 0,
        extraBufferCapacity = 64,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )

    /** Decoded inbound signals addressed to this device. */
    val signals: SharedFlow<CallSignal> = _signals.asSharedFlow()

    private var scope: CoroutineScope? = null
    private var eventJob: Job? = null

    /** The signed-in user's own id; used to build the personal inbox topic. */
    @Volatile private var selfUserId: String? = null

    /** The personal inbox topic currently joined, if any. */
    @Volatile private var inboxTopic: String? = null

    /** Per-call topics this client is currently joined to. */
    private val callTopics = ConcurrentHashMap.newKeySet<String>()

    /**
     * Begins listening for inbound call signals and joins [userId]'s personal
     * inbox. Safe to call repeatedly; a second call for the same user is a no-op.
     */
    @Synchronized
    fun start(appScope: CoroutineScope, userId: String) {
        val sanitized = sanitize(userId)
        if (sanitized.isEmpty()) {
            logger.w(TAG, "Cannot start call signalling without a user id")
            return
        }
        scope = appScope
        if (eventJob?.isActive != true) {
            eventJob = appScope.launch {
                realtime.events.collect { event ->
                    try {
                        handleEvent(event)
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (error: Exception) {
                        logger.w(TAG, "Could not process call signal", error)
                    }
                }
            }
        }
        selfUserId = sanitized
        val topic = inboxTopicFor(sanitized)
        if (inboxTopic != topic) {
            inboxTopic?.let { runCatching { realtime.unsubscribeBroadcast(it) } }
            inboxTopic = topic
            realtime.subscribeBroadcast(topic)
            logger.i(TAG, "Call signalling inbox joined")
        }
    }

    /**
     * Leaves every topic and stops delivering signals. Called on sign-out and
     * when the process is torn down. Safe to call repeatedly.
     */
    @Synchronized
    fun stop() {
        eventJob?.cancel()
        eventJob = null
        inboxTopic?.let { runCatching { realtime.unsubscribeBroadcast(it) } }
        inboxTopic = null
        callTopics.toList().forEach { runCatching { realtime.unsubscribeBroadcast(it) } }
        callTopics.clear()
        selfUserId = null
        scope = null
        logger.i(TAG, "Call signalling stopped")
    }

    /**
     * Joins the per-call topic so ring-back / accept / reject / hang-up signals
     * for [callId] are delivered. Both parties call this as soon as the call
     * exists — the caller when it starts dialling, the callee when it answers
     * the invite.
     */
    fun joinCall(callId: String) {
        val topic = callTopicFor(callId)
        if (topic == null) return
        if (!callTopics.add(topic)) return
        realtime.subscribeBroadcast(topic)
        logger.i(TAG, "Joined call signalling room")
    }

    /** Leaves the per-call topic. Safe to call for a call we never joined. */
    fun leaveCall(callId: String) {
        val topic = callTopicFor(callId) ?: return
        if (!callTopics.remove(topic)) return
        runCatching { realtime.unsubscribeBroadcast(topic) }
    }

    /**
     * Rings [toUserId]'s personal inbox. Returns `false` when the signal could
     * not be addressed (blank ids), in which case the caller should rely on the
     * FCM push path instead.
     */
    fun ring(toUserId: String, signal: CallSignal): Boolean {
        val topic = inboxTopicFor(sanitize(toUserId))
        if (topic == null) return false
        return publish(topic, signal)
    }

    /**
     * Publishes [signal] on the topic for its own call. Used for the ring-back,
     * accept, reject, busy and hang-up handshake once both parties are in the
     * per-call room.
     */
    fun send(signal: CallSignal): Boolean {
        val topic = callTopicFor(signal.callId) ?: return false
        return publish(topic, signal)
    }

    /** True once the coordinator is listening for inbound signals. */
    fun isStarted(): Boolean = eventJob?.isActive == true

    private fun publish(topic: String, signal: CallSignal): Boolean {
        val payload = runCatching { json.encodeToJsonElement(signal).jsonObject }
            .getOrElse {
                logger.w(TAG, "Could not encode call signal", it)
                return false
            }
        // The socket may not be up yet; broadcast() drops in that case and the
        // push path covers the gap.
        realtime.broadcast(topic, EVENT_CALL_SIGNAL, payload)
        return true
    }

    private suspend fun handleEvent(event: RealtimeEvent) {
        if (event !is RealtimeEvent.Broadcast) return
        if (event.event != EVENT_CALL_SIGNAL) return
        if (!isOurs(event.topic)) return
        val signal = runCatching { json.decodeFromJsonElement<CallSignal>(event.payload) }
            .getOrElse {
                logger.w(TAG, "Ignoring malformed call signal", it)
                return
            }
        // Defensive: a self-broadcast should never arrive (the channel is joined
        // with `self: false`), but never surface our own signal as an inbound one.
        if (signal.fromUserId.isNotEmpty() && signal.fromUserId == selfUserId) return
        _signals.tryEmit(signal)
    }

    private fun isOurs(topic: String): Boolean {
        val inbox = inboxTopic
        if (inbox != null && topic == inbox) return true
        return topic in callTopics
    }

    private fun callTopicFor(callId: String): String? {
        val id = sanitize(callId)
        return if (id.isEmpty()) null else "$CALL_TOPIC_PREFIX$id"
    }

    private fun inboxTopicFor(userId: String): String? =
        if (userId.isEmpty()) null else "$USER_TOPIC_PREFIX$userId"

    /**
     * Topic names travel through a Phoenix channel identifier, so restrict them
     * to the characters Supabase Realtime accepts and cap the length.
     */
    private fun sanitize(raw: String): String =
        raw.filter { it.isLetterOrDigit() || it == '_' || it == '-' }.take(MAX_ID_LENGTH)

    companion object {
        const val EVENT_CALL_SIGNAL = "call_signal"

        private const val TAG = "CallSignaling"
        private const val USER_TOPIC_PREFIX = "call:user:"
        private const val CALL_TOPIC_PREFIX = "call:"
        private const val MAX_ID_LENGTH = 64

        /** Topic a user's device listens on for inbound call invites. */
        fun inboxTopic(userId: String): String = "$USER_TOPIC_PREFIX$userId"

        /** Topic both parties join for the duration of one call. */
        fun callTopic(callId: String): String = "$CALL_TOPIC_PREFIX$callId"

        /**
         * Builds the invite that rings a callee's inbox. [payload] is a small
         * JSON blob carrying the presentation details the incoming-call screen
         * needs (caller display name, audio/video flag).
         */
        fun invite(
            callId: String,
            conversationId: String,
            fromUserId: String,
            toUserId: String,
            payload: JsonObject,
        ): CallSignal = CallSignal(
            callId = callId,
            conversationId = conversationId,
            fromUserId = fromUserId,
            toUserId = toUserId,
            kind = CallSignalKind.RINGING,
            payload = payload.toString(),
            createdAt = System.currentTimeMillis(),
        )
    }
}

/**
 * Reads the `video` flag out of an invite payload (see
 * [CallSignalingCoordinator.invite]).
 *
 * The payload is a small, best-effort JSON blob, so anything unparseable is
 * treated as an audio call: a malformed payload must never stop the phone from
 * ringing, it should only downgrade the presentation of the incoming screen.
 */
fun CallSignal.isVideoInvite(): Boolean {
    val raw = payload ?: return false
    return runCatching {
        Json.parseToJsonElement(raw).jsonObject["video"]?.jsonPrimitive?.content == "true"
    }.getOrDefault(false)
}
