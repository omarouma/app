package app.gagachat.core.database.di

import android.content.Context
import androidx.room.Room
import app.gagachat.core.database.GagaDatabase
import app.gagachat.core.database.dao.BlockDao
import app.gagachat.core.database.dao.CallDao
import app.gagachat.core.database.dao.ConversationDao
import app.gagachat.core.database.dao.MessageDao
import app.gagachat.core.database.dao.SyncStateDao
import app.gagachat.core.database.dao.UploadDao
import app.gagachat.core.database.dao.UserDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): GagaDatabase =
        Room.databaseBuilder(context, GagaDatabase::class.java, GagaDatabase.NAME)
            // WAL keeps reads non-blocking while the outbox writes (PDF §9.1).
            .setJournalMode(GagaDatabase.JournalMode.WRITE_AHEAD_LOGGING)
            .fallbackToDestructiveMigrationOnDowngrade()
            .build()

    @Provides
    fun provideUserDao(db: GagaDatabase): UserDao = db.userDao()

    @Provides
    fun provideConversationDao(db: GagaDatabase): ConversationDao = db.conversationDao()

    @Provides
    fun provideMessageDao(db: GagaDatabase): MessageDao = db.messageDao()

    @Provides
    fun provideCallDao(db: GagaDatabase): CallDao = db.callDao()

    @Provides
    fun provideUploadDao(db: GagaDatabase): UploadDao = db.uploadDao()

    @Provides
    fun provideBlockDao(db: GagaDatabase): BlockDao = db.blockDao()

    @Provides
    fun provideSyncStateDao(db: GagaDatabase): SyncStateDao = db.syncStateDao()
}
