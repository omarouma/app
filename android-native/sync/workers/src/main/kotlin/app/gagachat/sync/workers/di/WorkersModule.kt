package app.gagachat.sync.workers.di

import app.gagachat.sync.outbox.OutboxScheduler
import app.gagachat.sync.workers.DefaultOutboxScheduler
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/** Binds the WorkManager-backed outbox scheduler (PDF §13). */
@Module
@InstallIn(SingletonComponent::class)
abstract class WorkersModule {

    @Binds
    @Singleton
    abstract fun bindOutboxScheduler(impl: DefaultOutboxScheduler): OutboxScheduler
}
