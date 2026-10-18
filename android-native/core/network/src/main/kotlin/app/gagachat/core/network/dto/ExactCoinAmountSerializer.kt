package app.gagachat.core.network.dto

import java.math.BigDecimal
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive

/** Postgres numeric can encode whole coins as 1.00. Never round or overflow. */
object ExactCoinAmountSerializer : KSerializer<Long> {
    override val descriptor = PrimitiveSerialDescriptor("ExactCoinAmount", PrimitiveKind.LONG)
    override fun serialize(encoder: Encoder, value: Long) = encoder.encodeLong(value)
    override fun deserialize(decoder: Decoder): Long {
        if (decoder !is JsonDecoder) return decoder.decodeLong()
        val value = decoder.decodeJsonElement() as? JsonPrimitive
            ?: throw SerializationException("Coin amount must be numeric")
        return try { BigDecimal(value.content).longValueExact() }
        catch (e: IllegalArgumentException) { throw SerializationException("Invalid coin amount", e) }
        catch (e: ArithmeticException) { throw SerializationException("Coin amount must be a whole 64-bit integer", e) }
    }
}
