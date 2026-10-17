package app.gagachat.core.model

/**
 * A private, owner-scoped photo override for a contact.
 *
 * The override never mutates the contact's public avatar; it only changes what
 * the signed-in owner sees on this device. [localPath] points at a copy inside
 * the app's private storage, readable only by this app and only for the current
 * account. Because overrides are keyed by owner, switching accounts surfaces an
 * empty set instead of the previous user's private photos.
 */
data class ContactPhotoOverride(
    val contactId: String,
    val localPath: String,
    val updatedAt: Long,
)
