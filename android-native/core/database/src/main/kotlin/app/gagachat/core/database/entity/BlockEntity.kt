package app.gagachat.core.database.entity

import androidx.room.Entity
import androidx.room.Index

@Entity(
    tableName = "blocks",
    primaryKeys = ["ownerId", "targetId"],
    indices = [Index(value = ["ownerId"])],
)
data class BlockEntity(
    val ownerId: String,
    val targetId: String,
    val state: String,
    val createdAt: Long,
)
