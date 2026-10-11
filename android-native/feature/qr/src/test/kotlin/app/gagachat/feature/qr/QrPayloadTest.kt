package app.gagachat.feature.qr

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class QrPayloadTest {
    private val id = "e3bb7ca9-2f3e-4965-a4dd-f8124077dc13"

    @Test fun encodesShareableProfileLink() {
        assertEquals("https://gagachat.app/profile/$id", QrPayload.encodeUser(id))
    }

    @Test fun decodesNewAndLegacyCodes() {
        assertEquals(id, QrPayload.decodeUserId("https://gagachat.app/profile/$id"))
        assertEquals(id, QrPayload.decodeUserId("gaga://user/$id"))
        assertEquals(id, QrPayload.decodeUserId("gagachat://profile/$id"))
        assertEquals(id, QrPayload.decodeUserId(id))
        assertEquals(id, QrPayload.decodeUserId("Add on GaGa: https://gagachat.app/profile/$id"))
        assertEquals(id, QrPayload.decodeUserId("https://gagachat.app/profile/$id?ref=qr"))
    }

    @Test fun refusesUnknownUrlsAndArbitraryData() {
        assertNull(QrPayload.decodeUserId("https://example.com/profile/$id"))
        assertNull(QrPayload.decodeUserId("pay://transfer/100"))
        assertNull(QrPayload.decodeUserId("some-long-random-string"))
        assertNull(QrPayload.decodeUserId("hello world"))
        assertNull(QrPayload.decodeUserId("someone@example.com"))
    }

    @Test fun usernamesAreNotMisreadAsIdsOrEmailAddresses() {
        assertEquals("a_person", QrPayload.decodeUsername("@a_person"))
        assertEquals("a_person", QrPayload.decodeUsername("Add @a_person on GaGa"))
        assertNull(QrPayload.decodeUsername("someone@example.com"))
        assertNull(QrPayload.decodeUserId("@a_person"))
    }
}
