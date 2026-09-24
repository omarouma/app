package app.gagachat.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "call_sessions",
    indices = [Index(value = ["startedAt"]), Index(value = ["conversationId"])],
)
data class CallSessionEntity(
    @PrimaryKey val id: String,
    val conversationId: String,
    val initiatorId: String,
    val type: String,
    val startedAt: Long,
    val endedAt: Long?,
    val status: String,
    val peerId: String?,
    val peerName: String?,
    val peerAvatar: String?,
    val durationMs: Long?,
    val isOutgoing: Boolean,
)
