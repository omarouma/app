package app.gagachat.core.data.sync

import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.data.repository.MessageRepository
import app.gagachat.core.network.realtime.ChangeType
import app.gagachat.core.network.realtime.RealtimeEvent
import app.gagachat.core.network.realtime.SupabaseRealtimeClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Wires the realtime channel into the local-first data layer (PDF §4, §7).
 *
 * The socket is the *fast path*: an incoming `messages` INSERT is applied to the
 * Room cache immediately so the UI updates without a round-trip. The periodic
 * sync workers remain the *safety net* that reconciles anything missed while the
 * socket was down. This coordinator owns the socket subscription lifecycle and
 * is started/stopped with the app (or when the session changes).
 */
@Singleton
class RealtimeCoordinator @Inject constructor(
    private val realtime: SupabaseRealtimeClient,
    private val messageRepository: MessageRepository,
    private val logger: AppLogger,
) {

    private var scope: CoroutineScope? = null
    private var eventJob: Job? = null
    private var started = false

    /** Connects the socket and begins applying delta events to the cache. */
    @Synchronized
    fun start(appScope: CoroutineScope) {
        if (started) return
        started = true
        scope = appScope
        realtime.connect(appScope)
        realtime.subscribe(TABLE_MESSAGES)
        realtime.subscribe(TABLE_CHATS)
        realtime.subscribe(TABLE_TYPING)
        eventJob = appScope.launch {
            realtime.events.collect { event -> handleEvent(event) }
        }
        logger.i(TAG, "Realtime coordinator started")
    }

    /**
     * Tears down and re-establishes the socket so every topic is re-joined with a
     * fresh access token. Called once a session becomes available, because the
     * socket may have connected at process start before login.
     */
    @Synchronized
    fun restart(appScope: CoroutineScope) {
        stop()
        start(appScope)
    }

    /** Tears down the socket subscription. Safe to call repeatedly. */
    @Synchronized
    fun stop() {
        if (!started) return
        started = false
        eventJob?.cancel(); eventJob = null
        realtime.unsubscribe(TABLE_MESSAGES)
        realtime.unsubscribe(TABLE_CHATS)
        realtime.unsubscribe(TABLE_TYPING)
        realtime.disconnect()
        logger.i(TAG, "Realtime coordinator stopped")
    }

    private suspend fun handleEvent(event: RealtimeEvent) {
        when (event) {
            is RealtimeEvent.PostgresChange -> {
                when (event.table) {
                    TABLE_MESSAGES -> when (event.type) {
                        ChangeType.INSERT -> messageRepository.applyRealtimeInsert(event.record)
                        ChangeType.UPDATE -> messageRepository.applyRealtimeUpdate(event.record)
                        ChangeType.DELETE -> Unit // tombstones handled by the sync worker
                    }
                    TABLE_TYPING -> when (event.type) {
                        ChangeType.INSERT, ChangeType.UPDATE -> messageRepository.applyTypingEvent(event.record)
                        ChangeType.DELETE -> Unit
                    }
                    TABLE_CHATS -> Unit // conversation previews reconciled by the worker
                    else -> Unit
                }
            }
            is RealtimeEvent.ConnectionError ->
                logger.w(TAG, "Realtime connection error: ${event.message}")
            else -> Unit
        }
    }

    private companion object {
        const val TAG = "Realtime"
        const val TABLE_MESSAGES = "messages"
        const val TABLE_CHATS = "chats"
        const val TABLE_TYPING = "typing"
    }
}
