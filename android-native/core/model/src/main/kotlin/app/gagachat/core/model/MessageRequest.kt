package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class MessageRequest(val id: String, @SerialName("sender_id") val senderId: String,
    @SerialName("sender_name") val senderName: String = "GaGa User", val preview: String = "",
    @SerialName("chat_id") val chatId: String, val status: String = "pending")
