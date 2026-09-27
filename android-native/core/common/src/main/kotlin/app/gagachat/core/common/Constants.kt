package app.gagachat.core.common

/**
 * Cross-cutting constants. Values that must be tuned for performance live here so
 * they are auditable in one place (PDF §5.1, §9).
 */
object Constants {
    /** Number of recent messages rendered immediately from cache when opening a chat. */
    const val INITIAL_MESSAGE_PAGE_SIZE = 40

    /** Older messages fetched per upward scroll page. */
    const val MESSAGE_PAGE_SIZE = 30

    /** Conversations fetched per page for the home list. */
    const val CONVERSATION_PAGE_SIZE = 30

    /** Contacts fetched per incremental refresh. */
    const val CONTACT_PAGE_SIZE = 50

    /** Max outbox retry attempts before a message is marked FAILED. */
    const val OUTBOX_MAX_ATTEMPTS = 5

    /** Base backoff for outbox retries (exponential). */
    const val OUTBOX_BASE_BACKOFF_MS = 2_000L

    /** Presence/typing are ephemeral and never persisted as durable truth (PDF §4). */
    const val TYPING_TIMEOUT_MS = 5_000L
    const val PRESENCE_STALE_MS = 60_000L

    /** Image thumbnails are decoded at this max dimension in lists (PDF §6). */
    const val THUMBNAIL_MAX_DIMEN_PX = 512

    /** Max upload size accepted client-side before server-side validation. */
    const val MAX_UPLOAD_BYTES = 100L * 1024 * 1024

    /** WorkManager unique work names. */
    const val WORK_OUTBOX_SYNC = "gaga_outbox_sync"
    const val WORK_MESSAGE_SYNC = "gaga_message_sync"
    const val WORK_CONVERSATION_SYNC = "gaga_conversation_sync"
    const val WORK_CONTACT_SYNC = "gaga_contact_sync"
    const val WORK_MEDIA_UPLOAD = "gaga_media_upload"

    /** Notification channels. */
    const val CHANNEL_MESSAGES = "gaga_messages"
    const val CHANNEL_CALLS = "gaga_calls"
    const val CHANNEL_GENERAL = "gaga_general"
}
