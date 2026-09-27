package app.gagachat.core.data.di

import app.gagachat.core.data.call.CallMediaEngine
import app.gagachat.core.data.call.CallSignaling
import app.gagachat.core.data.call.NoOpCallMediaEngine
import app.gagachat.core.data.call.SupabaseCallSignaling
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Binds the WebRTC call subsystem (PDF §8). The signaling transport rides
 * Supabase Realtime broadcast; the media engine is the no-op lifecycle engine
 * that can be swapped for a native `org.webrtc` implementation without touching
 * anything above the data layer.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class CallModule {

    @Binds
    @Singleton
    abstract fun bindCallSignaling(impl: SupabaseCallSignaling): CallSignaling

    @Binds
    @Singleton
    abstract fun bindCallMediaEngine(impl: NoOpCallMediaEngine): CallMediaEngine
}
