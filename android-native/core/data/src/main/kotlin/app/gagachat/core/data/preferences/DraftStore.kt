package app.gagachat.core.data.preferences

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import javax.inject.Inject
import javax.inject.Singleton

/**
 * In-memory, per-conversation draft store (Master Spec §6 — composer).
 *
 * Keeps each chat's unsent text so switching between conversations — or leaving
 * a chat and coming back — never loses what the user was typing. A blank value
 * removes the entry, and [clear] is called once a message is actually sent.
 */
@Singleton
class DraftStore @Inject constructor() {

    private val drafts = MutableStateFlow<Map<String, String>>(emptyMap())

    /** Every live draft, keyed by conversation id (useful for a future drafts list). */
    val all: StateFlow<Map<String, String>> = drafts.asStateFlow()

    fun draft(conversationId: String): String =
        if (conversationId.isBlank()) "" else drafts.value[conversationId].orEmpty()

    fun set(conversationId: String, text: String) {
        if (conversationId.isBlank()) return
        drafts.update { current ->
            if (text.isBlank()) current - conversationId else current + (conversationId to text)
        }
    }

    fun clear(conversationId: String) {
        if (conversationId.isBlank()) return
        drafts.update { it - conversationId }
    }
}
