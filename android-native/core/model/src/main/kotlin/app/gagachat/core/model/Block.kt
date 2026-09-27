package app.gagachat.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Block / privacy entry (PDF §7.1 `blocks/privacy`).
 */
@Serializable
data class BlockEntry(
    @SerialName("owner_id") val ownerId: String,
    @SerialName("target_id") val targetId: String,
    val state: BlockState = BlockState.BLOCKED,
    @SerialName("created_at") val createdAt: Long = 0L,
)

@Serializable
enum class BlockState {
    @SerialName("blocked") BLOCKED,
    @SerialName("muted") MUTED,
    @SerialName("restricted") RESTRICTED,
}
