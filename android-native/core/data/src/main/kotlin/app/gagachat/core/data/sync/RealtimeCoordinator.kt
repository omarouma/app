package app.gagachat.core.data.sync

import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.NotificationRepository
import app.gagachat.core.data.repository.AuthRepository
import kotlinx.coroutines.channels.Channel
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import app.gagachat.core.data.repository.MessageRepository
import app.gagachat.core.data.repository.ConversationRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import app.gagachat.core.network.realtime.ChangeType
import app.gagachat.core.network.realtime.RealtimeEvent
import app.gagachat.core.network.realtime.SupabaseRealtimeClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first
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
    private val conversationRepository: ConversationRepository,
    private val logger: AppLogger,
    private val notificationRepository: NotificationRepository,
    private val authRepository: AuthRepository,
    private val friendsRepository: FriendsRepository,
) {

    private var scope: CoroutineScope? = null
    private var eventJob: Job? = null
    private var started = false
    private var notificationJob: Job? = null
    private var friendsJob: Job? = null
    private val friendRefreshes = Channel<Unit>(Channel.CONFLATED)
    private val notificationRefreshes = Channel<Unit>(Channel.CONFLATED)

    /** Connects the socket and begins applying delta events to the cache. */
    @Synchronized
    fun start(appScope: CoroutineScope) {
        if (started) return
        started = true
        scope = appScope
        notificationJob = appScope.launch {
            for (ignored in notificationRefreshes) {
                try { notificationRepository.refresh() }
                catch (cancelled: CancellationException) { throw cancelled }
                catch (error: Exception) { logger.w(TAG, "Could not refresh notification inbox", error) }
            }
        }
        friendsJob = appScope.launch {
            for (ignored in friendRefreshes) {
                try { friendsRepository.refresh() }
                catch (cancelled: CancellationException) { throw cancelled }
                catch (error: Exception) { logger.w(TAG, "Could not refresh friends", error) }
            }
        }
        eventJob = appScope.launch(start = CoroutineStart.UNDISPATCHED) {
            realtime.events.collect { event ->
                try { handleEvent(event) }
                catch (cancelled: CancellationException) { throw cancelled }
                catch (error: Exception) { logger.w(TAG, "Could not apply realtime event", error) }
            }
        }
        realtime.connect(appScope)
        realtime.subscribe(TABLE_MESSAGES)
        realtime.subscribe(TABLE_CHATS)
        realtime.subscribe(TABLE_TYPING)
        realtime.subscribe(TABLE_NOTIFICATIONS)
        realtime.subscribe(TABLE_FRIEND_REQUESTS)
        realtime.subscribe(TABLE_FRIENDSHIPS)
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
        notificationJob?.cancel(); notificationJob = null
        friendsJob?.cancel(); friendsJob = null
        while (friendRefreshes.tryReceive().isSuccess) { /* discard prior-account signals */ }
        while (notificationRefreshes.tryReceive().isSuccess) { /* discard prior-account signals */ }
        realtime.unsubscribe(TABLE_MESSAGES)
        realtime.unsubscribe(TABLE_CHATS)
        realtime.unsubscribe(TABLE_TYPING)
        realtime.unsubscribe(TABLE_NOTIFICATIONS)
        realtime.unsubscribe(TABLE_FRIEND_REQUESTS)
        realtime.unsubscribe(TABLE_FRIENDSHIPS)
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
                    TABLE_CHATS -> conversationRepository.syncConversations()
                    TABLE_FRIEND_REQUESTS, TABLE_FRIENDSHIPS -> {
                        val owner = authRepository.sessionFlow.value?.userId
                        val keys = if (event.table == TABLE_FRIEND_REQUESTS)
                            listOf("from_user_id", "to_user_id") else listOf("user_id", "friend_id")
                        val participants = keys.mapNotNull { event.record[it]?.jsonPrimitive?.contentOrNull }
                        // DELETE events can contain only a primary key. Fetch under
                        // the active account's RLS instead of applying raw payloads.
                        if (!owner.isNullOrBlank() && (participants.isEmpty() || owner in participants)) {
                            friendRefreshes.trySend(Unit)
                        }
                    }
                    TABLE_NOTIFICATIONS -> {
                        // Delete payloads may carry only a primary key. Refresh through
                        // RLS instead of displaying or trusting a foreign event payload.
                        val owner = authRepository.sessionFlow.value?.userId
                        val recipient = event.record["user_id"]?.jsonPrimitive?.contentOrNull
                        if (!owner.isNullOrBlank() && (recipient == null || recipient == owner)) {
                            notificationRefreshes.trySend(Unit)
                        }
                    }
                    else -> Unit
                }
            }
            is RealtimeEvent.Subscribed -> {
                if (event.topic in listOf("realtime:public:friend_requests", "realtime:public:friendships") &&
                    !authRepository.sessionFlow.value?.userId.isNullOrBlank()) {
                    friendRefreshes.trySend(Unit)
                }
                if (event.topic == "realtime:public:notifications") {
                    // Reconcile changes missed during disconnect, without posting
                    // a second Android push notification.
                    notificationRefreshes.trySend(Unit)
                }
                if (event.topic == "realtime:public:messages") {
                    conversationRepository.syncConversations()
                    conversationRepository.observeConversations().first().forEach {
                        messageRepository.syncNewMessages(it.id)
                    }
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
        const val TABLE_NOTIFICATIONS = "notifications"
        const val TABLE_FRIEND_REQUESTS = "friend_requests"
        const val TABLE_FRIENDSHIPS = "friendships"
    }
}
