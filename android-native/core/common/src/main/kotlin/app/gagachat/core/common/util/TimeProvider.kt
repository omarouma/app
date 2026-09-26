package app.gagachat.core.common.util

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import javax.inject.Inject

/**
 * Injectable clock. Server timestamps are authoritative (PDF §11); the client
 * clock is used only for optimistic display and ordering of pending messages.
 */
interface TimeProvider {
    fun nowMillis(): Long
    fun now(): Instant
}

class SystemTimeProvider @Inject constructor() : TimeProvider {
    override fun nowMillis(): Long = Clock.System.now().toEpochMilliseconds()
    override fun now(): Instant = Clock.System.now()
}
