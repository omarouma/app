package app.gagachat.core.model

/**
 * Per-chat notification mode (GaGa Notifications V3, issue #135).
 *
 * [ALL] delivers every message; [MENTIONS_ONLY] suppresses ordinary traffic but
 * still surfaces a confirmed @mention or a reply to the signed-in user;
 * [MUTE] suppresses everything until the mute expires.
 */
enum class NotificationMode {
    ALL,
    MENTIONS_ONLY,
    MUTE;

    companion object {
        /** Parses the server/client value, defaulting to [ALL] for unknown input. */
        fun from(raw: String?): NotificationMode = when (raw?.trim()?.lowercase()) {
            "mentions", "mentions_only", "mentions-only", "mention" -> MENTIONS_ONLY
            "mute", "muted", "none", "off", "silent" -> MUTE
            else -> ALL
        }
    }
}

/**
 * Pure, side-effect-free notification decisions.
 *
 * Keeping this logic out of `PushHandler` means the mute/mention rules are
 * unit-testable without an Android runtime, and the same rules can be reused by
 * the in-app audio path and by future server-side fan-out.
 *
 * Non-negotiable rules (roadmap §"Non-negotiable architecture rules"):
 *  - an explicit mute is absolute; nothing overrides it;
 *  - a confirmed @mention / reply-to-me may override a *group* mute, but never
 *    an explicit [NotificationMode.MUTE] or an OS DND policy;
 *  - a muted direct chat never rings for ordinary messages.
 */
object NotificationPolicy {

    /**
     * Whether an inbound message should surface a notification.
     *
     * @param isMuted the chat's current mute flag (legacy boolean).
     * @param mode the richer per-chat mode; defaults to [NotificationMode.MUTE]
     *   when [isMuted] is true and [NotificationMode.ALL] otherwise.
     * @param isMention the message contains a confirmed @mention of the recipient.
     * @param isReplyToMe the message is a confirmed reply to the recipient.
     * @param isGroup true for group/circle chats, where mention overrides apply.
     */
    fun shouldNotifyForMessage(
        isMuted: Boolean,
        mode: NotificationMode = if (isMuted) NotificationMode.MUTE else NotificationMode.ALL,
        isMention: Boolean = false,
        isReplyToMe: Boolean = false,
        isGroup: Boolean = false,
    ): Boolean = when (mode) {
        NotificationMode.MUTE -> false
        NotificationMode.MENTIONS_ONLY -> isMention || isReplyToMe
        NotificationMode.ALL -> if (!isMuted) true else isGroup && (isMention || isReplyToMe)
    }

    /** Stable per-conversation group key so unrelated chats never merge. */
    fun groupKey(conversationId: String): String = "gaga_chat_$conversationId"

    /** Stable summary-notification id for a conversation group. */
    fun summaryId(conversationId: String): Int = "gaga_summary_$conversationId".hashCode()

    /** Stable per-conversation notification id (replaces the old global id). */
    fun conversationNotificationId(conversationId: String): Int = conversationId.hashCode()

    /** Stable id for the missed-call notification of a conversation. */
    fun missedCallNotificationId(conversationId: String): Int = conversationId.hashCode() + 2

    /** Stable id for the incoming-call notification of a conversation. */
    fun incomingCallNotificationId(conversationId: String): Int = conversationId.hashCode() + 1

    /** Stable Android conversation shortcut id used for per-chat channels. */
    fun shortcutId(conversationId: String): String = "gaga_conv_$conversationId"
}
