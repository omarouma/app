package app.gagachat.core.database.entity

import androidx.room.Entity
import androidx.room.Index

/**
 * A private, owner-scoped contact photo override.
 *
 * This never mutates the contact's public avatar. The referenced [localPath]
 * points at a copy inside the app's private storage, so the image is readable
 * only by this app on this device and only for the signed-in owner. Rows are
 * keyed by (ownerId, contactId) so switching accounts never surfaces a previous
 * user's overrides.
 */
@Entity(
    tableName = "contact_photo_overrides",
    primaryKeys = ["ownerId", "contactId"],
    indices = [Index(value = ["ownerId"])],
)
data class ContactPhotoOverrideEntity(
    val ownerId: String,
    val contactId: String,
    val localPath: String,
    val updatedAt: Long,
)
