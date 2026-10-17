package app.gagachat.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import app.gagachat.core.database.entity.ContactPhotoOverrideEntity
import kotlinx.coroutines.flow.Flow

/**
 * Owner-scoped access to private contact photo overrides. Every query filters by
 * [ownerId] so a different signed-in account on the same device reads an empty
 * set instead of the previous user's overrides.
 */
@Dao
interface ContactPhotoOverrideDao {

    @Upsert
    suspend fun upsert(override: ContactPhotoOverrideEntity)

    @Query("SELECT * FROM contact_photo_overrides WHERE ownerId = :ownerId")
    fun observeByOwner(ownerId: String): Flow<List<ContactPhotoOverrideEntity>>

    @Query("SELECT * FROM contact_photo_overrides WHERE ownerId = :ownerId")
    suspend fun getByOwner(ownerId: String): List<ContactPhotoOverrideEntity>

    @Query("DELETE FROM contact_photo_overrides WHERE ownerId = :ownerId AND contactId = :contactId")
    suspend fun delete(ownerId: String, contactId: String)

    @Query("DELETE FROM contact_photo_overrides WHERE ownerId = :ownerId")
    suspend fun deleteByOwner(ownerId: String)

    @Query("DELETE FROM contact_photo_overrides")
    suspend fun deleteAll()
}
