package app.gagachat.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "users",
    indices = [
        Index(value = ["username"]),
        Index(value = ["email"]),
    ],
)
data class UserEntity(
    @PrimaryKey val id: String,
    val displayName: String,
    val username: String?,
    val avatar: String?,
    val phone: String?,
    val email: String?,
    val bio: String?,
    val status: String,
    val lastSeen: Long?,
    val createdAt: Long,
    val isVerified: Boolean,
    val isPremium: Boolean,
    /** Local row freshness marker for cache invalidation. */
    val cachedAt: Long,
)
