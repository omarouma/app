package app.gagachat.core.firebase.di

import app.gagachat.core.firebase.FirebaseSessionTokenSource
import app.gagachat.core.network.auth.SessionTokenSource
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet

/**
 * Contributes the Firebase-first token source to the shared token-source set that
 * `:core:network`'s HTTP client consumes (migration spec §2).
 *
 * The dependency direction stays one-way — `:core:firebase` depends on
 * `:core:network`, never the reverse — because the multibinding is assembled by
 * Dagger at the app level rather than by either module referencing the other.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class FirebaseAuthModule {

    @Binds
    @IntoSet
    abstract fun bindFirebaseTokenSource(impl: FirebaseSessionTokenSource): SessionTokenSource
}
