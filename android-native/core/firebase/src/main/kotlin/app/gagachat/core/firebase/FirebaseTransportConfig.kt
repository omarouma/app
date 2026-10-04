package app.gagachat.core.firebase

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Build-time configuration for the Firebase Hybrid transport.
 *
 * [enabled] is the master switch (defaults to `false` so the Supabase-only path
 * is the default). [tokenFunction] is the Supabase edge-function slug used to
 * mint the Firebase custom token that bridges the two auth systems.
 */
@Singleton
class FirebaseTransportConfig @Inject constructor() {
    val enabled: Boolean = BuildConfig.FIREBASE_TRANSPORT_ENABLED
    val tokenFunction: String = BuildConfig.FIREBASE_TOKEN_FUNCTION
}
