package app.gagachat.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import app.gagachat.core.database.dao.BlockDao
import app.gagachat.core.database.dao.CallDao
import app.gagachat.core.database.dao.ConversationDao
import app.gagachat.core.database.dao.MessageDao
import app.gagachat.core.database.dao.SyncStateDao
import app.gagachat.core.database.dao.UploadDao
import app.gagachat.core.database.dao.UserDao
import app.gagachat.core.database.entity.AttachmentEntity
import app.gagachat.core.database.entity.BlockEntity
import app.gagachat.core.database.entity.CallSessionEntity
import app.gagachat.core.database.entity.ConversationEntity
import app.gagachat.core.database.entity.ConversationMemberEntity
import app.gagachat.core.database.entity.MessageEntity
import app.gagachat.core.database.entity.PendingUploadEntity
import app.gagachat.core.database.entity.SyncStateEntity
import app.gagachat.core.database.entity.UserEntity

/**
 * Local-first cache database (PDF §4). The backend remains the authoritative
 * source; this database is the fast cache + offline/outbox layer.
 */
@Database(
    entities = [
        UserEntity::class,
        ConversationEntity::class,
        ConversationMemberEntity::class,
        MessageEntity::class,
        AttachmentEntity::class,
        CallSessionEntity::class,
        PendingUploadEntity::class,
        BlockEntity::class,
        SyncStateEntity::class,
    ],
    version = 3,
    exportSchema = true,
)
abstract class GagaDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao
    abstract fun conversationDao(): ConversationDao
    abstract fun messageDao(): MessageDao
    abstract fun callDao(): CallDao
    abstract fun uploadDao(): UploadDao
    abstract fun blockDao(): BlockDao
    abstract fun syncStateDao(): SyncStateDao

    companion object {
        const val NAME = "gaga.db"

        /**
         * v1 → v2: add the cached social-graph sizes to `users` so the profile
         * stats row can render real follower/following counts. Additive only —
         * existing rows default to 0.
         */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE users ADD COLUMN followersCount INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE users ADD COLUMN followingCount INTEGER NOT NULL DEFAULT 0")
            }
        }

        /**
         * v2 → v3: add multi-photo urls, reactions, forwarding and contact-card
         * columns to `messages`. Additive only — every column is nullable so
         * existing rows keep rendering unchanged.
         */
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE messages ADD COLUMN mediaUrls TEXT")
                db.execSQL("ALTER TABLE messages ADD COLUMN reactions TEXT")
                db.execSQL("ALTER TABLE messages ADD COLUMN forwardedFrom TEXT")
                db.execSQL("ALTER TABLE messages ADD COLUMN contactName TEXT")
                db.execSQL("ALTER TABLE messages ADD COLUMN contactPhone TEXT")
            }
        }
    }
}
