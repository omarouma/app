package app.gagachat.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
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
    version = 1,
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
    }
}
