package app.gagachat.core.model

import org.junit.Test
import org.junit.Assert.*

class NotificationCategoryTest {
    @Test fun metadataValuesDoNotBecomeAccidentalCategories() {
        val ordinary = AppNotification("n", "me", data = """{"body":"Mention this task to our supplier"}""")
        assertFalse(NotificationCategory.MENTIONS.matches(ordinary))
        assertFalse(NotificationCategory.TASKS.matches(ordinary))
        assertFalse(NotificationCategory.SHOPPING.matches(ordinary))
    }
    @Test fun structuredTasksAndMentionsAreRecognizedAndTaskTapsOpenToday() {
        val task = AppNotification("n", "me", data = """{"task_id":"123"}""")
        assertTrue(NotificationCategory.TASKS.matches(task))
        assertEquals(NotificationTarget.Today, task.target())
        assertTrue(NotificationCategory.MENTIONS.matches(AppNotification("n", "me", data = """{"type":"mention"}""")))
        for (value in listOf("[]", "not json", """{"type":{}}""")) {
            assertFalse(NotificationCategory.MENTIONS.matches(AppNotification("n", "me", data = value)))
        }
    }
}
