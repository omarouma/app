package app.gagachat.core.common.di

import javax.inject.Qualifier

/**
 * Qualifier for the process-wide [kotlinx.coroutines.CoroutineScope] that outlives
 * any single screen or ViewModel. Used by long-lived singletons (realtime socket,
 * outbox, presence heartbeat) that must survive configuration changes.
 */
@Retention(AnnotationRetention.BINARY)
@Qualifier
annotation class ApplicationScope
