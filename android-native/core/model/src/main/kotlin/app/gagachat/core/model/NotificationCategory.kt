package app.gagachat.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull

enum class NotificationCategory(val label: String) {
    ALL("All"), UNREAD("Unread"), MENTIONS("Mentions"), CALLS("Calls"), TASKS("Tasks"), PEOPLE("People"), SHOPPING("Shopping");

    fun matches(item: AppNotification): Boolean {
        val data = runCatching { Json.parseToJsonElement(item.data.orEmpty().take(16_384)).jsonObject }.getOrNull()
        fun value(key: String) = runCatching { data?.get(key)?.jsonPrimitive?.contentOrNull?.lowercase() }.getOrNull()
        fun has(key: String) = !value(key).isNullOrBlank()
        val kind = value("type") ?: value("action_type") ?: value("kind")
        return when (this) {
            ALL -> true
            UNREAD -> !item.read
            CALLS -> item.type == NotificationType.CALL
            PEOPLE -> item.type in setOf(NotificationType.FRIEND_REQUEST, NotificationType.FRIEND_ACCEPTED, NotificationType.GROUP_INVITE)
            MENTIONS -> kind in setOf("mention", "chat_mention", "circle_mention") || value("mention") == "true" || value("is_mention") == "true"
            TASKS -> has("task_id") || has("reminder_id") || kind in setOf("task", "task_due", "reminder", "event", "action_message")
            SHOPPING -> has("quotation_id") || has("order_id") || kind in setOf("china_shop", "quotation", "supplier_application", "order_update")
        }
    }
}
