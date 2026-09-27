package app.gagachat.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import app.gagachat.core.database.entity.CallSessionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface CallDao {

    @Upsert
    suspend fun upsert(session: CallSessionEntity)

    @Query("SELECT * FROM call_sessions ORDER BY startedAt DESC LIMIT :limit")
    fun observeHistory(limit: Int): Flow<List<CallSessionEntity>>

    @Query("SELECT * FROM call_sessions WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): CallSessionEntity?

    @Query(
        """
        UPDATE call_sessions
        SET status = :status, endedAt = :endedAt, durationMs = :durationMs
        WHERE id = :id
        """,
    )
    suspend fun finalize(id: String, status: String, endedAt: Long, durationMs: Long?)

    @Query("DELETE FROM call_sessions")
    suspend fun deleteAll()
}
