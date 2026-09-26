package app.gagachat.core.data.di

import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.BlockRepository
import app.gagachat.core.data.repository.CallRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.DefaultAuthRepository
import app.gagachat.core.data.repository.DefaultBlockRepository
import app.gagachat.core.data.repository.DefaultCallRepository
import app.gagachat.core.data.repository.DefaultConversationRepository
import app.gagachat.core.data.repository.DefaultFriendsRepository
import app.gagachat.core.data.repository.DefaultGroupRepository
import app.gagachat.core.data.repository.DefaultMediaRepository
import app.gagachat.core.data.repository.DefaultMessageRepository
import app.gagachat.core.data.repository.DefaultNotificationRepository
import app.gagachat.core.data.repository.DefaultUserRepository
import app.gagachat.core.data.repository.DefaultWalletRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.GroupRepository
import app.gagachat.core.data.repository.MediaRepository
import app.gagachat.core.data.repository.MessageRepository
import app.gagachat.core.data.repository.NotificationRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.data.repository.WalletRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Binds the repository contracts (domain-facing) to their local-first
 * implementations. All repositories are singletons because they own
 * in-memory caches and coordinate background sync.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class DataModule {

    @Binds
    @Singleton
    abstract fun bindAuthRepository(impl: DefaultAuthRepository): AuthRepository

    @Binds
    @Singleton
    abstract fun bindUserRepository(impl: DefaultUserRepository): UserRepository

    @Binds
    @Singleton
    abstract fun bindConversationRepository(impl: DefaultConversationRepository): ConversationRepository

    @Binds
    @Singleton
    abstract fun bindMessageRepository(impl: DefaultMessageRepository): MessageRepository

    @Binds
    @Singleton
    abstract fun bindMediaRepository(impl: DefaultMediaRepository): MediaRepository

    @Binds
    @Singleton
    abstract fun bindCallRepository(impl: DefaultCallRepository): CallRepository

    @Binds
    @Singleton
    abstract fun bindFriendsRepository(impl: DefaultFriendsRepository): FriendsRepository

    @Binds
    @Singleton
    abstract fun bindWalletRepository(impl: DefaultWalletRepository): WalletRepository

    @Binds
    @Singleton
    abstract fun bindGroupRepository(impl: DefaultGroupRepository): GroupRepository

    @Binds
    @Singleton
    abstract fun bindNotificationRepository(impl: DefaultNotificationRepository): NotificationRepository

    @Binds
    @Singleton
    abstract fun bindBlockRepository(impl: DefaultBlockRepository): BlockRepository
}
