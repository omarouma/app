package app.gagachat.core.firebase

import com.google.android.gms.tasks.Task
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Bridges the Supabase session into a Firebase Auth session so that
 * `FirebaseAuth.currentUser.uid == Supabase userId`.
 *
 * This identity alignment is what lets the Firestore security rules
 * (`request.auth.uid == senderId`) authorise the mirrored writes.
 */
@Singleton
class FirebaseAuthBridge @Inject constructor(
    private val environment: FirebaseEnvironment,
    private val tokenClient: FirebaseTokenClient,
) {
    /**
     * Ensures Firebase is signed in as [expectedUid]. Reuses an existing matching
     * session, otherwise mints a custom token and exchanges it. Returns `true`
     * only when the resulting Firebase uid matches [expectedUid].
     */
    suspend fun ensureSignedIn(expectedUid: String): Boolean {
        if (expectedUid.isBlank()) return false
        val auth = environment.auth ?: return false

        val current = auth.currentUser
        if (current != null && current.uid == expectedUid) return true
        if (current != null) runCatching { auth.signOut() }

        val minted = tokenClient.mint().getOrNull() ?: return false
        if (minted.uid != expectedUid) return false

        return runCatching {
            val result = auth.signInWithCustomToken(minted.customToken).awaitResult()
            val user = result.user ?: return false
            user.uid == expectedUid
        }.getOrDefault(false)
    }

    suspend fun signOut() {
        runCatching { environment.auth?.signOut() }
    }
}

/** Awaits a Google Play Services [Task] without pulling in an extra dependency. */
internal suspend fun <T> Task<T>.awaitResult(): T = suspendCancellableCoroutine { cont ->
    addOnCompleteListener { task ->
        if (task.isSuccessful) {
            cont.resume(task.result)
        } else {
            cont.resumeWithException(task.exception ?: IllegalStateException("Firebase task failed"))
        }
    }
}
