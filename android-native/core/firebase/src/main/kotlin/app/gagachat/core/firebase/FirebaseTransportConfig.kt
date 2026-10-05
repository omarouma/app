package app.gagachat.core.firebase

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Build-time configuration for the Firebase transport.
 *
 * [enabled] is the master switch for the Firestore chat transport (defaults to
 * `false` so the Supabase-only path is the default). [authFirst] additionally
 * moves *authentication* to Firebase (Firebase Auth + the `firebase-identity`
 * mapping) — it is only honoured when [enabled] is also on. [tokenFunction] is
 * the legacy custom-token bridge slug; [identityFunction] is the trusted
 * uid ↔ GaGa-id mapping function.
 */
@Singleton
class FirebaseTransportConfig @Inject constructor() {
    val enabled: Boolean = BuildConfig.FIREBASE_TRANSPORT_ENABLED
    val authFirst: Boolean = BuildConfig.FIREBASE_AUTH_FIRST && BuildConfig.FIREBASE_TRANSPORT_ENABLED
    val tokenFunction: String = BuildConfig.FIREBASE_TOKEN_FUNCTION
    val identityFunction: String = BuildConfig.FIREBASE_IDENTITY_FUNCTION
}
