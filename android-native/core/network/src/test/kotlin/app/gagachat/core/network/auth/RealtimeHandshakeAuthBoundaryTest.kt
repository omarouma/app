package app.gagachat.core.network.auth

import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RealtimeHandshakeAuthBoundaryTest {
    @Test fun onlyRealtimeUpgradeSkipsBearerInterceptor() {
        assertTrue(isRealtimeUpgradePath("/realtime/v1/websocket"))
        assertFalse(isRealtimeUpgradePath("/realtime/v1/api/broadcast"))
        assertFalse(isRealtimeUpgradePath("/rest/v1/messages"))
        assertFalse(isRealtimeUpgradePath("/functions/v1/create-call"))
        assertFalse(isRealtimeUpgradePath("/auth/v1/token"))
    }

    @Test fun websocketUpgradeRemovesUnexpectedBearerButKeepsApiKey() {
        val request = Request.Builder()
            .url("https://example.supabase.co/realtime/v1/websocket?apikey=public-test-key&vsn=1.0.0")
            .header("Authorization", "Bearer fake-user-token")
            .header("X-Trace", "preserve")
            .build()
        val clean = stripRealtimeUpgradeAuthorization(request)
        assertNull(clean.header("Authorization"))
        assertEquals("public-test-key", clean.url.queryParameter("apikey"))
        assertEquals("preserve", clean.header("X-Trace"))
        assertEquals(request.url, clean.url)
    }

    @Test fun nonUpgradeRequestsKeepTheirAuthorization() {
        val paths = listOf(
            "/realtime/v1/api/broadcast",
            "/rest/v1/messages",
            "/functions/v1/create-call",
        )
        paths.forEach { path ->
            val request = Request.Builder()
                .url("https://example.supabase.co$path")
                .header("Authorization", "Bearer fake-user-token")
                .build()
            assertEquals(
                "Bearer fake-user-token",
                stripRealtimeUpgradeAuthorization(request).header("Authorization"),
            )
        }
    }
}
