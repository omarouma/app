package app.gagachat.core.common.di

import app.gagachat.core.common.network.AndroidNetworkMonitor
import app.gagachat.core.common.network.NetworkMonitor
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Binds the platform [NetworkMonitor] implementation (Master Spec §E). Kept in
 * `:core:common` so every layer (data, ui, feature) can inject connectivity
 * without depending on an Android-specific module.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class NetworkMonitorModule {

    @Binds
    @Singleton
    abstract fun bindNetworkMonitor(impl: AndroidNetworkMonitor): NetworkMonitor
}
