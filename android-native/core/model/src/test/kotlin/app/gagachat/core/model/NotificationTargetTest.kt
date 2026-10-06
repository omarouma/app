package app.gagachat.core.model

import org.junit.Assert.*
import org.junit.Test

class NotificationTargetTest {
    @Test fun messageOpensOnlyTheIdentifiedChat() {
        val id = "12345678-1234-1234-1234-123456789abc"
        val item = AppNotification("n", "u", NotificationType.MESSAGE, data = """{"chat_id":"$id"}""")
        assertEquals(NotificationTarget.Chat(id), item.target())
    }
    @Test fun routesAndUrlsInMetadataAreNeverExecuted() {
        for (data in listOf("""{"chat_id":"settings/delete-account"}""", """{"url":"https://evil.test"}""", "not json", "[]")) {
            assertNull(AppNotification("n", "u", NotificationType.MESSAGE, data = data).target())
        }
    }
    @Test fun friendAndCallNotificationsHaveSafeFallbacks() {
        assertEquals(NotificationTarget.People, AppNotification("n", "u", NotificationType.FRIEND_REQUEST).target())
        assertEquals(NotificationTarget.Calls, AppNotification("n", "u", NotificationType.CALL).target())
        assertNull(AppNotification("n", "u", NotificationType.SYSTEM).target())
    }
}
