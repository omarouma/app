package app.gagachat.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import app.gagachat.core.database.entity.SavedPlaceEntity
import kotlinx.coroutines.flow.Flow

/**
 * Owner-scoped access to saved places. Every query filters by [ownerId] so a
 * different signed-in account on the same device reads an empty set instead of
 * the previous user's favourites.
 */
@Dao
interface SavedPlaceDao {

    @Upsert
    suspend fun upsert(place: SavedPlaceEntity)

    @Query("SELECT * FROM saved_places WHERE ownerId = :ownerId ORDER BY createdAt DESC")
    fun observeByOwner(ownerId: String): Flow<List<SavedPlaceEntity>>

    @Query("SELECT * FROM saved_places WHERE ownerId = :ownerId ORDER BY createdAt DESC")
    suspend fun getByOwner(ownerId: String): List<SavedPlaceEntity>

    @Query("DELETE FROM saved_places WHERE ownerId = :ownerId AND id = :id")
    suspend fun delete(ownerId: String, id: String)

    @Query("DELETE FROM saved_places WHERE ownerId = :ownerId")
    suspend fun deleteByOwner(ownerId: String)

    @Query("DELETE FROM saved_places")
    suspend fun deleteAll()
}
