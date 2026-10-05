package app.gagachat.core.data.di

import app.gagachat.core.database.DatabaseNameProvider
import app.gagachat.core.database.GagaDatabase
import app.gagachat.core.network.session.SessionStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Binds the account-scoped database name (migration spec §2).
 *
 * Lives in `:core:data` because it needs both the session layer (`SessionStore`)
 * and the database layer (`GagaDatabase`), which `:core:database` cannot see
 * without creating a dependency on `:core:network`. The persisted session is read
 * synchronously, so the name is correct the first time the database is opened.
 */
@Module
@InstallIn(SingletonComponent::class)
object AccountDatabaseModule {

    @Provides
    @Singleton
    fun provideDatabaseNameProvider(sessionStore: SessionStore): DatabaseNameProvider =
        DatabaseNameProvider { GagaDatabase.accountDatabaseName(sessionStore.userId()) }
}
