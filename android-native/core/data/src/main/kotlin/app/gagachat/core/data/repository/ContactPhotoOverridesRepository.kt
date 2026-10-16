package app.gagachat.core.data.repository

import android.content.Context
import android.net.Uri
import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.database.dao.ContactPhotoOverrideDao
import app.gagachat.core.database.entity.ContactPhotoOverrideEntity
import app.gagachat.core.model.ContactPhotoOverride
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

/**
 * Private, owner-scoped per-contact photo overrides.
 *
 * Local-first and private: a chosen image is copied into the app's private
 * storage (`filesDir/contact_photos/<ownerId>/`) and referenced from the
 * on-device database. It is never uploaded and never mutates the contact's
 * public avatar. Every read is filtered by the signed-in owner id, so switching
 * accounts (or signing out) yields an empty map instead of the previous user's
 * private photos.
 */
interface ContactPhotoOverridesRepository {
    /** Emits the current account's overrides keyed by contact id. Empty when signed out. */
    fun observeOverrides(): Flow<Map<String, ContactPhotoOverride>>

    /**
     * Copies [source] into private storage and records it as the override for
     * [contactId]. Returns true on success. No-op (false) when signed out.
     */
    suspend fun setOverride(contactId: String, source: Uri): Boolean

    /** Removes the override row and deletes the private copy from disk. */
    suspend fun clearOverride(contactId: String)
}

@Singleton
class DefaultContactPhotoOverridesRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val dao: ContactPhotoOverrideDao,
    private val authRepository: AuthRepository,
    private val dispatchers: DispatcherProvider,
) : ContactPhotoOverridesRepository {

    private val currentOwnerId: String
        get() = authRepository.sessionFlow.value?.userId.orEmpty()

    override fun observeOverrides(): Flow<Map<String, ContactPhotoOverride>> {
        val owner = currentOwnerId
        if (owner.isBlank()) return flowOf(emptyMap())
        return dao.observeByOwner(owner).map { rows ->
            rows.associate { it.contactId to it.toDomain() }
        }
    }

    override suspend fun setOverride(contactId: String, source: Uri): Boolean =
        withContext(dispatchers.io) {
            val owner = currentOwnerId
            if (owner.isBlank() || contactId.isBlank()) return@withContext false

            val dir = ownerDir(owner).apply { if (!exists()) mkdirs() }
            val extension = extensionFor(context.contentResolver.getType(source))
            val target = File(dir, "$contactId.$extension")

            // Drop any previous copy for this contact (possibly a different extension).
            dir.listFiles { file -> file.name.startsWith("$contactId.") }
                ?.forEach { if (it != target) it.delete() }

            val input = context.contentResolver.openInputStream(source)
            val copied = input != null && runCatching {
                input.use { stream ->
                    target.outputStream().use { output -> stream.copyTo(output) }
                }
            }.isSuccess && target.length() > 0L

            if (!copied) {
                target.delete()
                return@withContext false
            }

            dao.upsert(
                ContactPhotoOverrideEntity(
                    ownerId = owner,
                    contactId = contactId,
                    localPath = target.absolutePath,
                    updatedAt = System.currentTimeMillis(),
                ),
            )
            true
        }

    override suspend fun clearOverride(contactId: String) {
        withContext(dispatchers.io) {
            val owner = currentOwnerId
            if (owner.isBlank()) return@withContext
            val existing = dao.getByOwner(owner).firstOrNull { it.contactId == contactId }
            dao.delete(owner, contactId)
            existing?.let { runCatching { File(it.localPath).delete() } }
        }
    }

    private fun ownerDir(owner: String): File = File(context.filesDir, "contact_photos/$owner")

    private fun extensionFor(mime: String?): String = when (mime?.lowercase()) {
        "image/png" -> "png"
        "image/webp" -> "webp"
        "image/gif" -> "gif"
        "image/heic", "image/heif" -> "heic"
        else -> "jpg"
    }
}

private fun ContactPhotoOverrideEntity.toDomain(): ContactPhotoOverride = ContactPhotoOverride(
    contactId = contactId,
    localPath = localPath,
    updatedAt = updatedAt,
)
