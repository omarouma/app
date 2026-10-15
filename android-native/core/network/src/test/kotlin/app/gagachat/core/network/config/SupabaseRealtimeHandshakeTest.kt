package app.gagachat.core.network.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SupabaseRealtimeHandshakeTest {
    @Test fun modernKeyIsPreferredAndLegacyKeyRemainsFallback() {
        val config = SupabaseConfig(
            url = "https://example.supabase.co",
            anonKey = "sb_publishable_test",
            storageBucket = "chat-media",
            realtimeAnonKey = "eyJlegacy.public.JWT",
        )
        assertEquals(2, config.realtimeSocketUrls.size)
        assertTrue(config.realtimeSocketUrls[0].contains("apikey=sb_publishable_test"))
        assertTrue(config.realtimeSocketUrls[1].contains("apikey=eyJlegacy.public.JWT"))
    }

    @Test fun onePublicKeyDoesNotCreateDuplicateHandshakes() {
        val config = SupabaseConfig(
            url = "https://example.supabase.co",
            anonKey = "sb_publishable_test",
            storageBucket = "chat-media",
        )
        assertEquals(1, config.realtimeSocketUrls.size)
        assertTrue(config.realtimeSocketUrl.startsWith("wss://example.supabase.co/realtime/v1/websocket?"))
    }
}
