package app.gagachat.mobile.model

import org.json.JSONObject

data class Me(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String?,
    val phone: String?,
    val bio: String?
) {
    companion object {
        fun fromJson(j: JSONObject) = Me(
            id = j.optString("id"),
            username = j.optString("username"),
            displayName = j.optString("display_name", j.optString("username")),
            avatarUrl = j.optString("avatar_url").takeIf { it.isNotBlank() },
            phone = j.optString("phone").takeIf { it.isNotBlank() },
            bio = j.optString("bio").takeIf { it.isNotBlank() }
        )
    }
    val initials: String get() = displayName.split(" ").map { it.firstOrNull() ?: ' ' }.take(2).joinToString("").uppercase()
}

data class Chat(
    val id: String,
    val type: String,             // "dm" | "group"
    val title: String,
    val avatarUrl: String?,
    val peerId: String?,
    val lastMessage: String?,
    val lastMessageAt: Long?,
    val unread: Int,
    val verified: Boolean
) {
    companion object {
        fun fromJson(j: JSONObject) = Chat(
            id = j.optString("id"),
            type = j.optString("type", "dm"),
            title = j.optString("title", j.optString("peer_name", "Chat")),
            avatarUrl = j.optString("avatar_url").takeIf { it.isNotBlank() },
            peerId = j.optString("peer_id").takeIf { it.isNotBlank() },
            lastMessage = j.optString("last_message").takeIf { it.isNotBlank() },
            lastMessageAt = if (j.has("last_message_at")) j.optLong("last_message_at") else null,
            unread = j.optInt("unread", 0),
            verified = j.optBoolean("verified", false)
        )
    }
}

data class Message(
    val id: String,
    val chatId: String,
    val senderId: String,
    val senderName: String,
    val text: String?,
    val attachmentUrl: String?,
    val attachmentType: String?,   // image | video | file | audio
    val createdAt: Long,
    val mine: Boolean,
    val clientMessageId: String? = null
) {
    companion object {
        fun fromJson(j: JSONObject, myId: String) = Message(
            id = j.optString("id"),
            chatId = j.optString("chat_id"),
            senderId = j.optString("sender_id"),
            senderName = j.optString("sender_name", j.optString("sender", "…")),
            text = j.optString("text").takeIf { it.isNotBlank() },
            attachmentUrl = j.optString("attachment_url").takeIf { it.isNotBlank() },
            attachmentType = j.optString("attachment_type").takeIf { it.isNotBlank() },
            createdAt = j.optLong("created_at", System.currentTimeMillis()),
            mine = j.optString("sender_id") == myId,
            clientMessageId = j.optString("client_message_id").takeIf { it.isNotBlank() && it != "null" }
        )
    }
}

data class CallEvent(
    val callId: String,
    val peerId: String?,
    val peerName: String,
    val peerAvatar: String?,
    val video: Boolean
) {
    companion object {
        fun fromJson(j: JSONObject) = CallEvent(
            callId = j.optString("call_id"),
            peerId = j.optString("peer_id").takeIf { it.isNotBlank() },
            peerName = j.optString("peer_name", "Unknown"),
            peerAvatar = j.optString("peer_avatar").takeIf { it.isNotBlank() },
            video = j.optBoolean("video", false)
        )
    }
}

data class WalletInfo(
    val balance: Double,
    val symbol: String,
    val rateUsd: Double
) {
    companion object {
        fun fromJson(j: JSONObject) = WalletInfo(
            balance = j.optDouble("balance", 0.0),
            symbol = j.optString("symbol", "GAGA"),
            rateUsd = j.optDouble("rate_usd", 0.01)
        )
    }
}

data class Contact(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String?,
    val verified: Boolean,
    val online: Boolean
) {
    companion object {
        fun fromJson(j: JSONObject) = Contact(
            id = j.optString("id"),
            username = j.optString("username"),
            displayName = j.optString("display_name", j.optString("username")),
            avatarUrl = j.optString("avatar_url").takeIf { it.isNotBlank() },
            verified = j.optBoolean("verified", false),
            online = j.optBoolean("online", false)
        )
    }
}
