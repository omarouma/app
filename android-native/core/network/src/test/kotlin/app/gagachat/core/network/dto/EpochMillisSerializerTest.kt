package app.gagachat.core.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EpochMillisSerializerTest {
    @Serializable
    private data class Payload(
        @Serializable(with = EpochMillisSerializer::class)
        val lastSeenAt: Long? = null,
    )

    @Test
    fun serializesEpochMillisAsIsoTimestampForPostgrest() {
        val raw = Json.encodeToString(Payload(1_791_380_714_730L))
        assertTrue(raw.contains("2026-10-07T13:45:14.730Z"))
        assertFalse(raw.contains("1791380714730"))
    }
}
