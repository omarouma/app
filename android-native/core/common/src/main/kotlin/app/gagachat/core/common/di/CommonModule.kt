package app.gagachat.core.common.di

import app.gagachat.core.common.util.AndroidAppLogger
import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.common.util.IdGenerator
import app.gagachat.core.common.util.SystemTimeProvider
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.common.util.UuidGenerator
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class CommonModule {

    @Binds
    @Singleton
    abstract fun bindDispatcherProvider(impl: DefaultDispatcherProvider): DispatcherProvider

    @Binds
    @Singleton
    abstract fun bindLogger(impl: AndroidAppLogger): AppLogger

    @Binds
    @Singleton
    abstract fun bindTimeProvider(impl: SystemTimeProvider): TimeProvider

    @Binds
    @Singleton
    abstract fun bindIdGenerator(impl: UuidGenerator): IdGenerator
}
