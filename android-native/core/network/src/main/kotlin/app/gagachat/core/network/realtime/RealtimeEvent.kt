package app.gagachat.core.network.realtime

import kotlinx.serialization.json.JsonObject

/**
 * Normalised realtime events surfaced to the data layer (PDF §7 — provider-specific
 * calls never reach Compose screens).
 */
sealed interface RealtimeEvent {
    data class PostgresChange(
        val table: String,
        val type: ChangeType,
        val record: JsonObject,
        val oldRecord: JsonObject?,
    ) : RealtimeEvent

    data class Subscribed(val topic: String) : RealtimeEvent
    data class Unsubscribed(val topic: String) : RealtimeEvent
    data class Failure(val topic: String, val message: String) : RealtimeEvent
    data class ConnectionError(val message: String) : RealtimeEvent
}

enum class ChangeType { INSERT, UPDATE, DELETE }
