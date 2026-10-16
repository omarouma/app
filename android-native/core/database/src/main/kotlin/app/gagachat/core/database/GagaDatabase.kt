package app.gagachat.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import app.gagachat.core.database.dao.BlockDao
import app.gagachat.core.database.dao.CallDao
import app.gagachat.core.database.dao.ContactPhotoOverrideDao
import app.gagachat.core.database.dao.ConversationDao
import app.gagachat.core.database.dao.MessageDao
import app.gagachat.core.database.dao.SavedPlaceDao
import app.gagachat.core.database.dao.SyncStateDao
import app.gagachat.core.database.dao.UploadDao
import app.gagachat.core.database.dao.UserDao
import app.gagachat.core.database.entity.AttachmentEntity
import app.gagachat.core.database.entity.BlockEntity
import app.gagachat.core.database.entity.CallSessionEntity
import app.gagachat.core.database.entity.ContactPhotoOverrideEntity
import app.gagachat.core.database.entity.ConversationEntity
import app.gagachat.core.database.entity.ConversationMemberEntity
import app.gagachat.core.database.entity.MessageEntity
import app.gagachat.core.database.entity.PendingUploadEntity
import app.gagachat.core.database.entity.SavedPlaceEntity
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
        SavedPlaceEntity::class,
        ContactPhotoOverrideEntity::class,
        SyncStateEntity::class,
    ],
    version = 9,
    exportSchema = true,
)
abstract class GagaDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao
    abstract fun conversationDao(): ConversationDao
    abstract fun messageDao(): MessageDao
    abstract fun callDao(): CallDao
    abstract fun uploadDao(): UploadDao
    abstract fun blockDao(): BlockDao
    abstract fun savedPlaceDao(): SavedPlaceDao
    abstract fun contactPhotoOverrideDao(): ContactPhotoOverrideDao
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

        /**
         * v3 → v4: add the profile cover image plus the `statusMessage` / `website`
         * columns to `users` so the profile header can render a real cover and the
         * "about"/link lines straight from the cache. Additive only — every column
         * is nullable so existing rows keep rendering unchanged.
         */
        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE users ADD COLUMN coverImage TEXT")
                db.execSQL("ALTER TABLE users ADD COLUMN statusMessage TEXT")
                db.execSQL("ALTER TABLE users ADD COLUMN website TEXT")
            }
        }

        /**
         * v4 \u2192 v5: add the local-only `hiddenForMe` flag to `messages` so a user can
         * "delete for me" without touching the server copy. Additive, NOT NULL with a
         * default of 0 so existing rows keep rendering.
         */
        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE messages ADD COLUMN hiddenForMe INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE messages ADD COLUMN liveExpiresAt INTEGER")
                db.execSQL("ALTER TABLE messages ADD COLUMN pollQuestion TEXT")
                db.execSQL("ALTER TABLE messages ADD COLUMN pollOptions TEXT")
            }
        }

        /**
         * v5 \u2192 v6: add the dedicated `coverVideo` column to `users` so a cover
         * *video* is cached separately from the cover *photo* (`coverImage`). The
         * backend stores these in two distinct columns; caching them together made
         * the video/photo covers clobber each other. Additive + nullable so
         * existing rows keep rendering unchanged.
         */
        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE users ADD COLUMN coverVideo TEXT")
            }
        }

        /**
         * v6 \u2192 v7: add the local-only `scheduledAt` column to `messages` so a
         * message can be queued for future delivery. Nullable, so every existing
         * row is treated as an ordinary (immediately-sent) message.
         */
        val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE messages ADD COLUMN scheduledAt INTEGER")
            }
        }

        /**
         * v7 → v8: add the owner-scoped `saved_places` table backing location
         * favourites. Additive only — no existing table is touched, so a device
         * upgrading keeps every cached message, conversation and block.
         */
        val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `saved_places` (" +
                        "`ownerId` TEXT NOT NULL, " +
                        "`id` TEXT NOT NULL, " +
                        "`label` TEXT NOT NULL, " +
                        "`detail` TEXT NOT NULL, " +
                        "`latitude` REAL NOT NULL, " +
                        "`longitude` REAL NOT NULL, " +
                        "`createdAt` INTEGER NOT NULL, " +
                        "PRIMARY KEY(`ownerId`, `id`))",
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS `index_saved_places_ownerId` " +
                        "ON `saved_places` (`ownerId`)",
                )
            }
        }

        /**
         * v8 \u2192 v9: add the owner-scoped `contact_photo_overrides` table backing
         * private per-contact photo overrides. Additive only \u2014 no existing table
         * is touched, so a device upgrading keeps every cached message, saved
         * place and block.
         */
        val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `contact_photo_overrides` (" +
                        "`ownerId` TEXT NOT NULL, " +
                        "`contactId` TEXT NOT NULL, " +
                        "`localPath` TEXT NOT NULL, " +
                        "`updatedAt` INTEGER NOT NULL, " +
                        "PRIMARY KEY(`ownerId`, `contactId`))",
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS `index_contact_photo_overrides_ownerId` " +
                        "ON `contact_photo_overrides` (`ownerId`)",
                )
            }
        }
    }
}
