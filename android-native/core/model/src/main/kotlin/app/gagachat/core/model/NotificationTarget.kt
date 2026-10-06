package app.gagachat.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

sealed interface NotificationTarget {
    data class Chat(val id: String) : NotificationTarget
    data object People : NotificationTarget
    data object Calls : NotificationTarget
}

/** Route only known internal destinations; never execute a supplied URL or route. */
fun AppNotification.target(): NotificationTarget? {
    if (type == NotificationType.FRIEND_REQUEST || type == NotificationType.FRIEND_ACCEPTED) return NotificationTarget.People
    val objectData = runCatching { Json.parseToJsonElement(data.orEmpty().take(16_384)).jsonObject }.getOrNull()
    val id = listOf("chat_id", "conversation_id").firstNotNullOfOrNull { key ->
        runCatching { objectData?.get(key)?.jsonPrimitive?.content }.getOrNull()
            ?.takeIf { it.matches(Regex("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")) }
    }
    return when {
        id != null && type in listOf(NotificationType.MESSAGE, NotificationType.CALL, NotificationType.GROUP_INVITE) -> NotificationTarget.Chat(id)
        type == NotificationType.CALL -> NotificationTarget.Calls
        type == NotificationType.GROUP_INVITE -> NotificationTarget.People
        else -> null
    }
}
