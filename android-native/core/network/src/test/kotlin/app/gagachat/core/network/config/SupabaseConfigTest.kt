package app.gagachat.core.network.config

import org.junit.Assert.assertEquals
import org.junit.Test

class SupabaseConfigTest {
    @Test
    fun realtimeSocketPrefersActivePublishableKeyAndRetainsLegacyFallback() {
        val config = SupabaseConfig(
            url = "https://example.supabase.co",
            anonKey = "sb_publishable_test",
            storageBucket = "chat-media",
            realtimeAnonKey = "eyJlegacy.header.signature",
        )

        assertEquals(
            "wss://example.supabase.co/realtime/v1/websocket?apikey=sb_publishable_test&vsn=1.0.0",
            config.realtimeSocketUrl,
        )
        assertEquals(
            "wss://example.supabase.co/realtime/v1/websocket?apikey=eyJlegacy.header.signature&vsn=1.0.0",
            config.realtimeSocketUrls[1],
        )
    }

    @Test
    fun existingCallersDefaultRealtimeKeyToCurrentKey() {
        val config = SupabaseConfig(
            url = "https://example.supabase.co",
            anonKey = "legacy-anon",
            storageBucket = "chat-media",
        )

        assertEquals("legacy-anon", config.realtimeAnonKey)
    }
}
