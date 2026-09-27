package app.gagachat.core.common.util

import java.util.UUID
import javax.inject.Inject

/**
 * Generates client-side identifiers.
 *
 * `clientMessageId` is the idempotency key that guarantees one user action
 * produces exactly one message even across retries/observers (PDF §5.2).
 */
interface IdGenerator {
    fun newClientMessageId(): String
    fun newUploadId(): String
    fun newUuid(): String

    /**
     * Group/channel conversation id. MUST be a bare UUID: the live `groups.id`
     * column is `uuid`, while the mirrored `chats.id` is `text` (so a bare UUID
     * satisfies both). Direct chats use a deterministic `dm_` id instead.
     */
    fun newConversationId(): String
}

class UuidGenerator @Inject constructor() : IdGenerator {
    override fun newClientMessageId(): String = UUID.randomUUID().toString()
    override fun newUploadId(): String = UUID.randomUUID().toString()
    override fun newUuid(): String = UUID.randomUUID().toString()
    override fun newConversationId(): String = UUID.randomUUID().toString()
}
