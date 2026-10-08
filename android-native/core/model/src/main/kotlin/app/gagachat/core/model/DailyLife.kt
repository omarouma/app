package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.math.BigDecimal
import java.math.RoundingMode

/** Personal records are bookkeeping, never a custodial or spendable balance. */
@Serializable
data class DailyRecord(
    val id: String,
    @SerialName("owner_id") val ownerId: String,
    val kind: String,
    val title: String,
    @SerialName("amount_minor") val amountMinor: Long = 0,
    @SerialName("paid_minor") val paidMinor: Long = 0,
    val currency: String = "BDT",
    val category: String = "Other",
    val account: String = "Cash",
    val note: String = "",
    @SerialName("happened_at") val happenedAt: String,
    @SerialName("due_at") val dueAt: String? = null,
    val completed: Boolean = false,
    @SerialName("source_chat") val sourceChat: String? = null,
    @SerialName("source_message") val sourceMessage: String? = null,
)

@Serializable
data class ShoppingList(
    val id: String,
    @SerialName("owner_id") val ownerId: String,
    val title: String,
    @SerialName("member_ids") val memberIds: List<String> = emptyList(),
)

@Serializable
data class ShoppingItem(
    val id: String,
    @SerialName("list_id") val listId: String,
    val name: String,
    val quantity: String = "1",
    val purchased: Boolean = false,
)

object DailyMoney {
    // Two decimal places for supported BDT, USD and CNY. Reject rounding and overflow.
    fun parseMinor(text: String): Long? = runCatching {
        val value = BigDecimal(text.trim())
        require(value.signum() > 0)
        value.setScale(2, RoundingMode.UNNECESSARY).movePointRight(2).longValueExact()
            .also { require(it <= 100_000_000_000L) }
    }.getOrNull()

    fun format(minor: Long): String = BigDecimal.valueOf(minor, 2).toPlainString()
}
