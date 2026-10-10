package app.gagachat.core.data.repository

import app.gagachat.core.common.Constants
import app.gagachat.core.model.MessageType

/**
 * Single source of truth for the client-side upload cap of each media kind
 * (V3.0 Sprint B, checklist row #6 \u2014 "per-type size validation").
 *
 * Before this existed the only check was a 100 MB global ceiling, so audio files
 * and documents had *no* meaningful limit of their own and were queued only to
 * fail late. Both the ViewModel (early, user-facing validation) and the
 * repository (defence in depth) now resolve the cap through here, so the two can
 * never drift apart.
 */
fun mediaUploadLimit(type: MessageType): Long = when (type) {
    MessageType.IMAGE -> Constants.MAX_IMAGE_UPLOAD_BYTES
    MessageType.VIDEO -> Constants.MAX_VIDEO_UPLOAD_BYTES
    MessageType.AUDIO -> Constants.MAX_AUDIO_UPLOAD_BYTES
    MessageType.FILE -> Constants.MAX_DOCUMENT_UPLOAD_BYTES
    else -> Constants.MAX_UPLOAD_BYTES
}

/** A short, human noun for a media kind, used in validation copy. */
fun mediaKindLabel(type: MessageType): String = when (type) {
    MessageType.IMAGE -> "photo"
    MessageType.VIDEO -> "video"
    MessageType.AUDIO -> "audio file"
    MessageType.FILE -> "document"
    else -> "file"
}

/** The per-type cap expressed in whole megabytes, for user-facing messages. */
fun mediaUploadLimitMb(type: MessageType): Long = mediaUploadLimit(type) / (1024 * 1024)
