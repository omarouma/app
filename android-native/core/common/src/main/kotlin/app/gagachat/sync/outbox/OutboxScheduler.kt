package app.gagachat.sync.outbox

/**
 * WorkManager unique names and input keys shared by the scheduler and workers.
 */
object OutboxWork {
    const val MESSAGE_SEND = "gaga_message_send"
    const val MEDIA_UPLOAD = "gaga_media_upload"
    const val CONVERSATION_SYNC = "gaga_conversation_sync"
    const val MESSAGE_SYNC = "gaga_message_sync"
    const val PERIODIC_SYNC = "gaga_periodic_sync"

    const val KEY_CLIENT_MESSAGE_ID = "client_message_id"
    const val KEY_CONVERSATION_ID = "conversation_id"
}

/**
 * Durable outbox scheduler contract (PDF §4, §6, §13). Every send/upload/sync is
 * a WorkManager request with network constraints and exponential backoff, so work
 * survives process death and retries safely. Idempotency is guaranteed upstream
 * by the stable `clientMessageId`.
 *
 * The interface lives in `:core:common` (which every layer depends on) so the
 * data layer can enqueue durable work without depending on `:sync:workers`
 * (which would be a circular dependency). The implementation lives in
 * `:sync:workers` because it references the concrete worker classes.
 */
interface OutboxScheduler {
    fun enqueueMessageSend(clientMessageId: String)
    fun enqueueMediaUpload()
    fun enqueueConversationSync()
    fun enqueueMessageSync(conversationId: String)
    fun schedulePeriodicSync()
}
