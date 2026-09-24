package app.gagachat.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import app.gagachat.core.database.entity.BlockEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface BlockDao {

    @Upsert
    suspend fun upsert(block: BlockEntity)

    @Upsert
    suspend fun upsertAll(blocks: List<BlockEntity>)

    @Query("SELECT * FROM blocks WHERE ownerId = :ownerId")
    fun observeByOwner(ownerId: String): Flow<List<BlockEntity>>

    @Query("SELECT * FROM blocks WHERE ownerId = :ownerId AND targetId = :targetId LIMIT 1")
    suspend fun get(ownerId: String, targetId: String): BlockEntity?

    @Query("DELETE FROM blocks WHERE ownerId = :ownerId AND targetId = :targetId")
    suspend fun delete(ownerId: String, targetId: String)

    @Query("DELETE FROM blocks")
    suspend fun deleteAll()
}
