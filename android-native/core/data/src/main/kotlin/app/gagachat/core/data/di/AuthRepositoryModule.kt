package app.gagachat.core.data.di

import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.DefaultAuthRepository
import app.gagachat.core.data.repository.FirebaseFirstAuthRepository
import app.gagachat.core.firebase.FirebaseTransportConfig
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Selects the [AuthRepository] implementation at runtime (migration spec §2).
 *
 * The default is the proven Supabase implementation; the Firebase-first
 * implementation is used only when `FIREBASE_AUTH_FIRST` is on. Both are
 * singletons and share the same encrypted session store, so switching the flag
 * never forks the session state.
 */
@Module
@InstallIn(SingletonComponent::class)
object AuthRepositoryModule {

    @Provides
    @Singleton
    fun provideAuthRepository(
        legacy: DefaultAuthRepository,
        firebaseFirst: FirebaseFirstAuthRepository,
        config: FirebaseTransportConfig,
    ): AuthRepository = if (config.authFirst) firebaseFirst else legacy
}
