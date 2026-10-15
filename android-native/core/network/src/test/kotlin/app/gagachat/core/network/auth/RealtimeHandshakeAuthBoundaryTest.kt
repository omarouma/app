package app.gagachat.core.network.auth

import org.junit.Assert.assertFalse
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
}
