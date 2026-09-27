package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A bookmarked message (LIVE table `saved_messages`). Surfaced through the
 * Profile hub "Saved Messages" screen — a private list of notes and bookmarks
 * the signed-in user has kept.
 */
@Serializable
data class SavedMessage(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("message_id") val messageId: String,
    @SerialName("chat_id") val chatId: String,
    @SerialName("sender_id") val senderId: String? = null,
    val content: String? = null,
    val type: String = "text",
    @SerialName("media_url") val mediaUrl: String? = null,
    @SerialName("saved_at") val savedAt: Long = 0L,
) {
    /** Short preview used in the list row. */
    val preview: String
        get() = content?.takeIf { it.isNotBlank() }
            ?: when (type.lowercase()) {
                "image", "photo" -> "Photo"
                "video" -> "Video"
                "audio", "voice" -> "Voice message"
                "location" -> "Location"
                "file", "document" -> "Document"
                else -> "Saved message"
            }
}
