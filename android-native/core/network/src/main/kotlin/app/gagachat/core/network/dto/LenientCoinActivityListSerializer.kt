package app.gagachat.core.network.dto

import app.gagachat.core.model.CoinActivity
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/**
 * Tolerant (de)serializer for the `wallets.transactions` jsonb column.
 *
 * The column is normally a JSON array of [CoinActivity] objects, but legacy
 * rows may store it as a JSON-encoded string (e.g. the literal `"[]"`). This
 * serializer accepts both shapes and falls back to an empty list on any
 * unexpected value, so a single malformed row can never break the wallet
 * screen. Writing always emits a proper JSON array.
 */
object LenientCoinActivityListSerializer : KSerializer<List<CoinActivity>?> {

    private val listSerializer = ListSerializer(CoinActivity.serializer())
    private val delegate = listSerializer.nullable
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
    }

    override val descriptor: SerialDescriptor = delegate.descriptor

    override fun deserialize(decoder: Decoder): List<CoinActivity>? {
        val input = decoder as? JsonDecoder ?: return delegate.deserialize(decoder)
        return runCatching {
            when (val element = input.decodeJsonElement()) {
                is JsonArray -> json.decodeFromJsonElement(listSerializer, element)
                JsonNull -> null
                is JsonPrimitive -> {
                    val text = element.content.trim()
                    if (text.isEmpty() || text == "null") null
                    else json.decodeFromString(listSerializer, text)
                }
                else -> emptyList()
            }
        }.getOrElse { emptyList() }
    }

    override fun serialize(encoder: Encoder, value: List<CoinActivity>?) {
        delegate.serialize(encoder, value)
    }
}
