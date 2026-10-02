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
    /** Profile cover media URL (photo or video) shown behind the avatar. */
    val coverImage: String? = null,
    val phone: String?,
    val email: String?,
    val bio: String?,
    /** Free-text "about" line shown under the display name. */
    val statusMessage: String? = null,
    /** Optional personal website / link shown on the profile. */
    val website: String? = null,
    val status: String,
    val lastSeen: Long?,
    val createdAt: Long,
    val isVerified: Boolean,
    val isPremium: Boolean,
    /** Size of the backend `followers` / `following` text[] arrays. */
    val followersCount: Int = 0,
    val followingCount: Int = 0,
    /** Local row freshness marker for cache invalidation. */
    val cachedAt: Long,
)
