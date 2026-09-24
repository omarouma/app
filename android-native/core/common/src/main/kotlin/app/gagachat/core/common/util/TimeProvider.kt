package app.gagachat.core.common.util

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

/**
 * Injectable clock. Server timestamps are authoritative (PDF §11); the client
 * clock is used only for optimistic display and ordering of pending messages.
 */
interface TimeProvider {
    fun nowMillis(): Long
    fun now(): Instant
}

class SystemTimeProvider : TimeProvider {
    override fun nowMillis(): Long = Clock.System.now().toEpochMilliseconds()
    override fun now(): Instant = Clock.System.now()
}
