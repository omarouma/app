package app.gagachat.core.database.entity

import androidx.room.Entity
import androidx.room.Index

/**
 * A private, owner-scoped saved place (location favourite). Rows are keyed by
 * both the owning account and a locally generated id so favourites from one
 * signed-in account can never leak into another on the same device, and so the
 * same label can be saved twice without collision. There is no background
 * tracking: a row exists only because the user explicitly saved a pin.
 */
@Entity(
    tableName = "saved_places",
    primaryKeys = ["ownerId", "id"],
    indices = [Index(value = ["ownerId"])],
)
data class SavedPlaceEntity(
    val ownerId: String,
    val id: String,
    val label: String,
    val detail: String,
    val latitude: Double,
    val longitude: Double,
    val createdAt: Long,
)
