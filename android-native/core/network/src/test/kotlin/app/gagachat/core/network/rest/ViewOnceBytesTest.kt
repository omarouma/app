package app.gagachat.core.network.rest

import java.io.ByteArrayInputStream
import org.junit.Assert.*
import org.junit.Test

class ViewOnceBytesTest {
    @Test fun inputAboveHardLimitIsRejectedBeforeNetworkSend() {
        val result = runCatching { ViewOncePhotoApi.readPhotoBytes(ByteArrayInputStream(ByteArray(ViewOncePhotoApi.MAX_BYTES + 1))) }
        assertTrue(result.exceptionOrNull() is IllegalArgumentException)
    }
    @Test fun acceptedPhotoKeepsOriginalBytes() {
        val bytes = byteArrayOf(1,2,3)
        assertArrayEquals(bytes, ViewOncePhotoApi.readPhotoBytes(ByteArrayInputStream(bytes)))
    }
}
