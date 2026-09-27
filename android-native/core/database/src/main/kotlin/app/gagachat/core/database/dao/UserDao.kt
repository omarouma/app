package app.gagachat.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import app.gagachat.core.database.entity.UserEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface UserDao {

    @Upsert
    suspend fun upsert(user: UserEntity)

    @Upsert
    suspend fun upsertAll(users: List<UserEntity>)

    @Query("SELECT * FROM users WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): UserEntity?

    @Query("SELECT * FROM users WHERE id = :id LIMIT 1")
    fun observeById(id: String): Flow<UserEntity?>

    @Query("SELECT * FROM users WHERE id IN (:ids)")
    fun observeByIds(ids: List<String>): Flow<List<UserEntity>>

    /** All cached users — used by the shared identity-resolution layer. */
    @Query("SELECT * FROM users")
    fun observeAll(): Flow<List<UserEntity>>

    @Query(
        """
        SELECT * FROM users
        WHERE displayName LIKE '%' || :query || '%'
           OR username LIKE '%' || :query || '%'
        ORDER BY displayName ASC
        LIMIT :limit
        """,
    )
    fun search(query: String, limit: Int): Flow<List<UserEntity>>

    @Query("DELETE FROM users WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM users")
    suspend fun deleteAll()
}
