package app.gagachat.core.firebase

import app.gagachat.core.network.session.AuthSession
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Keeps Firebase Auth in lock-step with the Supabase session: signs in (via the
 * custom-token bridge) whenever a Supabase session exists and signs out when it
 * disappears.
 *
 * No-op when the transport flag is off or Firebase is not configured, so the
 * Supabase-only build is completely unaffected.
 */
@Singleton
class FirebaseSessionCoordinator @Inject constructor(
    private val environment: FirebaseEnvironment,
    private val bridge: FirebaseAuthBridge,
    private val config: FirebaseTransportConfig,
) {
    fun start(scope: CoroutineScope, sessions: Flow<AuthSession?>) {
        if (!config.enabled || !environment.isConfigured) return
        scope.launch {
            sessions.collect { session ->
                runCatching {
                    if (session == null) {
                        bridge.signOut()
                    } else {
                        bridge.ensureSignedIn(session.userId)
                    }
                }
            }
        }
    }
}
