package app.gagachat.core.network.realtime

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RealtimeJwtGuardTest {
    private val validShape = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcd1234_efgh5678"

    @Test fun acceptsCompactJwtShapeForServerSideVerification() {
        assertTrue(isCompactJwt(validShape))
    }

    @Test fun refusesMissingOpaqueAndMalformedTokens() {
        listOf(null, "", " ", "undefined", "Bearer ", "sb_publishable_example",
            "a.b.c", "one.two", validShape + "\nmalformed")
            .forEach { assertFalse("Rejected malformed Realtime token", isCompactJwt(it)) }
    }
}
