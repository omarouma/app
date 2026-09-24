package app.gagachat.core.common.util

import java.util.UUID

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
}

class UuidGenerator : IdGenerator {
    override fun newClientMessageId(): String = UUID.randomUUID().toString()
    override fun newUploadId(): String = UUID.randomUUID().toString()
    override fun newUuid(): String = UUID.randomUUID().toString()
}
