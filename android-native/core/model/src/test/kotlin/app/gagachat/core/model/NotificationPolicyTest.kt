package app.gagachat.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationPolicyTest {

    @Test
    fun `unmuted direct chat notifies`() {
        assertTrue(NotificationPolicy.shouldNotifyForMessage(isMuted = false))
    }

    @Test
    fun `muted direct chat is silent`() {
        assertFalse(NotificationPolicy.shouldNotifyForMessage(isMuted = true))
    }

    @Test
    fun `muted group mention overrides group mute`() {
        assertTrue(
            NotificationPolicy.shouldNotifyForMessage(
                isMuted = true,
                isMention = true,
                isGroup = true,
            ),
        )
    }

    @Test
    fun `muted group reply overrides group mute`() {
        assertTrue(
            NotificationPolicy.shouldNotifyForMessage(
                isMuted = true,
                isReplyToMe = true,
                isGroup = true,
            ),
        )
    }

    @Test
    fun `muted direct mention does not override`() {
        assertFalse(
            NotificationPolicy.shouldNotifyForMessage(
                isMuted = true,
                isMention = true,
                isGroup = false,
            ),
        )
    }

    @Test
    fun `explicit mute mode never notifies even for mentions`() {
        assertFalse(
            NotificationPolicy.shouldNotifyForMessage(
                isMuted = false,
                mode = NotificationMode.MUTE,
                isMention = true,
                isGroup = true,
            ),
        )
    }

    @Test
    fun `mentions-only suppresses ordinary traffic`() {
        assertFalse(
            NotificationPolicy.shouldNotifyForMessage(
                isMuted = false,
                mode = NotificationMode.MENTIONS_ONLY,
            ),
        )
    }

    @Test
    fun `mentions-only delivers a mention`() {
        assertTrue(
            NotificationPolicy.shouldNotifyForMessage(
                isMuted = false,
                mode = NotificationMode.MENTIONS_ONLY,
                isMention = true,
            ),
        )
    }

    @Test
    fun `mode parses known aliases and defaults to all`() {
        assertEquals(NotificationMode.MENTIONS_ONLY, NotificationMode.from("mentions_only"))
        assertEquals(NotificationMode.MUTE, NotificationMode.from("muted"))
        assertEquals(NotificationMode.ALL, NotificationMode.from(null))
        assertEquals(NotificationMode.ALL, NotificationMode.from("something-new"))
    }

    @Test
    fun `group keys and ids are stable and distinct per conversation`() {
        assertEquals("gaga_chat_a", NotificationPolicy.groupKey("a"))
        assertEquals(NotificationPolicy.summaryId("a"), NotificationPolicy.summaryId("a"))
        assertNotEquals(NotificationPolicy.summaryId("a"), NotificationPolicy.summaryId("b"))
        assertNotEquals(
            NotificationPolicy.conversationNotificationId("a"),
            NotificationPolicy.conversationNotificationId("b"),
        )
        assertEquals("gaga_conv_a", NotificationPolicy.shortcutId("a"))
    }
}
