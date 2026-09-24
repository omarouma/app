package app.gagachat.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Tracks delta-sync cursors per stream so the client never re-fetches full
 * datasets (PDF §4, §9.1 — network delta sync).
 */
@Entity(tableName = "sync_state")
data class SyncStateEntity(
    @PrimaryKey val key: String,
    val lastSyncedAt: Long,
    val cursor: String?,
)
