package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SplitBill(
    val id: String,
    @SerialName("chat_id") val chatId: String,
    @SerialName("creator_id") val creatorId: String,
    @SerialName("source_message") val sourceMessage: String? = null,
    val title: String,
    @SerialName("total_minor") val totalMinor: Long,
    val currency: String = "BDT",
    @SerialName("due_at") val dueAt: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String,
)

@Serializable
data class SplitBillMember(
    @SerialName("bill_id") val billId: String,
    @SerialName("user_id") val userId: String,
    @SerialName("share_minor") val shareMinor: Long,
    val settled: Boolean = false,
    @SerialName("settled_at") val settledAt: String? = null,
    @SerialName("settled_by") val settledBy: String? = null,
)

object SplitBillMath {
    fun equalShares(totalMinor: Long, participantCount: Int): List<Long> {
        require(totalMinor > 0 && participantCount >= 2)
        val base = totalMinor / participantCount
        val remainder = (totalMinor % participantCount).toInt()
        require(base > 0)
        return List(participantCount) { index -> base + if (index < remainder) 1 else 0 }
    }
}
