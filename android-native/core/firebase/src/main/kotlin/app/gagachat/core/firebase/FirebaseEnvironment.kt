package app.gagachat.core.firebase

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.firestore.FirebaseFirestore
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Owns the process-wide Firebase entry points (Auth / Firestore / RTDB).
 *
 * Every accessor is null-safe: when the app was built without
 * `google-services.json` (or Firebase failed to initialise) [isConfigured] is
 * `false` and the accessors return `null`, so callers degrade to the
 * Supabase-only path instead of crashing.
 */
@Singleton
class FirebaseEnvironment @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    val isConfigured: Boolean =
        runCatching { FirebaseApp.getApps(context).isNotEmpty() }.getOrDefault(false)

    val auth: FirebaseAuth?
        get() = if (isConfigured) runCatching { FirebaseAuth.getInstance() }.getOrNull() else null

    val firestore: FirebaseFirestore?
        get() = if (isConfigured) runCatching { FirebaseFirestore.getInstance() }.getOrNull() else null

    val database: FirebaseDatabase?
        get() = if (isConfigured) runCatching { FirebaseDatabase.getInstance() }.getOrNull() else null
}
