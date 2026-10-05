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

    // ---------------------------------------------------------------------
    // Message edit / delete eligibility windows (spec §6).
    // The same windows are enforced in the repository so the rule holds even
    // if the UI is bypassed.
    // ---------------------------------------------------------------------

    /** A message may be edited within 15 minutes of being sent. */
    const val EDIT_WINDOW_MS = 15L * 60 * 1000

    /** "Delete for everyone" is allowed within 1 hour; "delete for me" is unlimited. */
    const val DELETE_FOR_EVERYONE_WINDOW_MS = 60L * 60 * 1000

    // ---------------------------------------------------------------------
    // Voice recording (spec §7).
    // ---------------------------------------------------------------------

    /** Clips shorter than this are treated as an accidental tap and discarded. */
    const val MIN_VOICE_RECORDING_MS = 700L

    /** Hard cap on a single voice note; recording auto-stops at this length. */
    const val MAX_VOICE_RECORDING_MS = 5L * 60 * 1000

    /** Show a countdown warning once this much time remains before the cap. */
    const val VOICE_WARN_REMAINING_MS = 30L * 1000

    // ---------------------------------------------------------------------
    // Attachment validation limits (spec §8).
    // ---------------------------------------------------------------------

    /** Maximum size for a single image upload. */
    const val MAX_IMAGE_BYTES = 25L * 1024 * 1024

    /** Maximum size for a single video upload. */
    const val MAX_VIDEO_BYTES = 100L * 1024 * 1024

    /** Maximum duration for a video upload. */
    const val MAX_VIDEO_DURATION_MS = 10L * 60 * 1000

    /** Maximum size for a single document upload. */
    const val MAX_DOCUMENT_BYTES = 100L * 1024 * 1024

    /** Maximum size for a single audio file upload. */
    const val MAX_AUDIO_BYTES = 25L * 1024 * 1024

    /** Maximum number of photos that can be selected in a single album. */
    const val MAX_ALBUM_PHOTOS = 10
}
