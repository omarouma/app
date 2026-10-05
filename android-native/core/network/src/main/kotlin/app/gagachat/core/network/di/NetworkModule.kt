package app.gagachat.core.network.di

import app.gagachat.core.network.auth.AuthTokenInterceptor
import app.gagachat.core.network.auth.AuthTokenRefresher
import app.gagachat.core.network.auth.SessionTokenSource
import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.session.EncryptedSessionStore
import app.gagachat.core.network.session.SessionStore
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideSupabaseConfig(): SupabaseConfig = SupabaseConfig.fromBuildConfig()

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
        explicitNulls = false
    }

    @Provides
    @Singleton
    fun provideHttpClient(
        json: Json,
        config: SupabaseConfig,
        // Every registered token source (Supabase here, Firebase from
        // :core:firebase). Dagger assembles the set at the app level, so this
        // module never depends on :core:firebase.
        tokenSources: Set<@JvmSuppressWildcards SessionTokenSource>,
    ): HttpClient = HttpClient(OkHttp) {
        expectSuccess = true
        // Guarantee a valid access token on every backend call (and self-heal on
        // 401). Without this the app kept using the token captured at sign-in,
        // so once it expired every chat/media/call request failed together.
        engine {
            config {
                addInterceptor(AuthTokenInterceptor(tokenSources, config))
            }
        }
        install(ContentNegotiation) { json(json) }
        install(WebSockets)
        install(HttpTimeout) {
            requestTimeoutMillis = 30_000
            connectTimeoutMillis = 15_000
            socketTimeoutMillis = 30_000
        }
        install(Logging) {
            // Security baseline (PDF §11): never log bodies/headers in release.
            level = LogLevel.NONE
        }
        defaultRequest {
            headers.append("X-Client-Info", "gaga-android/1.0.0")
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class SessionModule {
    @Binds
    @Singleton
    abstract fun bindSessionStore(impl: EncryptedSessionStore): SessionStore

    /**
     * Contributes the legacy Supabase token source. It has the higher [priority]
     * value, so the Firebase source (contributed from `:core:firebase`) is
     * consulted first whenever it is active.
     */
    @Binds
    @IntoSet
    abstract fun bindSupabaseTokenSource(impl: AuthTokenRefresher): SessionTokenSource
}
