package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.database.dao.SavedPlaceDao
import app.gagachat.core.database.entity.SavedPlaceEntity
import app.gagachat.core.model.SavedPlace
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

/**
 * Owner-scoped location favourites. Local-first and private: a saved place is
 * written to the on-device database keyed by the signed-in account and is never
 * uploaded or shared. Switching accounts (or signing out) yields an empty list
 * because every read is filtered by the current owner id.
 */
interface SavedPlacesRepository {
    /** Emits the current account's favourites, newest first. Empty when signed out. */
    fun observeSavedPlaces(): Flow<List<SavedPlace>>

    suspend fun save(label: String, detail: String, latitude: Double, longitude: Double): SavedPlace?

    suspend fun delete(id: String)
}

@Singleton
class DefaultSavedPlacesRepository @Inject constructor(
    private val savedPlaceDao: SavedPlaceDao,
    private val authRepository: AuthRepository,
    private val dispatchers: DispatcherProvider,
) : SavedPlacesRepository {

    private val currentOwnerId: String
        get() = authRepository.sessionFlow.value?.userId.orEmpty()

    override fun observeSavedPlaces(): Flow<List<SavedPlace>> {
        val owner = currentOwnerId
        if (owner.isBlank()) return flowOf(emptyList())
        return savedPlaceDao.observeByOwner(owner).map { rows -> rows.map { it.toDomain() } }
    }

    override suspend fun save(
        label: String,
        detail: String,
        latitude: Double,
        longitude: Double,
    ): SavedPlace? = withContext(dispatchers.io) {
        val owner = currentOwnerId
        if (owner.isBlank()) return@withContext null
        val place = SavedPlace(
            id = UUID.randomUUID().toString(),
            label = label.trim().ifBlank { "Saved place" }.take(80),
            detail = detail.trim().take(200),
            latitude = latitude,
            longitude = longitude,
            createdAt = System.currentTimeMillis(),
        )
        savedPlaceDao.upsert(place.toEntity(owner))
        place
    }

    override suspend fun delete(id: String) = withContext(dispatchers.io) {
        val owner = currentOwnerId
        if (owner.isBlank()) return@withContext
        savedPlaceDao.delete(owner, id)
    }
}

private fun SavedPlaceEntity.toDomain(): SavedPlace = SavedPlace(
    id = id,
    label = label,
    detail = detail,
    latitude = latitude,
    longitude = longitude,
    createdAt = createdAt,
)

private fun SavedPlace.toEntity(ownerId: String): SavedPlaceEntity = SavedPlaceEntity(
    ownerId = ownerId,
    id = id,
    label = label,
    detail = detail,
    latitude = latitude,
    longitude = longitude,
    createdAt = createdAt,
)
