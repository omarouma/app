package app.gagachat.feature.chat.presentation

import app.gagachat.core.model.MessageType

/**
 * Presentation policy kept separate from the repository's media transport.
 * Media or documents can open their dedicated viewer; actionable content such
 * as calls, contacts, location cards and audio players must use their own UI.
 */
internal fun MessageType.opensMediaViewer(): Boolean = when (this) {
    MessageType.IMAGE, MessageType.VIDEO, MessageType.FILE -> true
    else -> false
}

/** The existing forward-picker supports exactly one message at a time. */
internal fun canForwardSelection(count: Int): Boolean = count == 1
