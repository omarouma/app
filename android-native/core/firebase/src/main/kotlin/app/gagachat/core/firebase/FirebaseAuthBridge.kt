package app.gagachat.core.firebase

import com.google.android.gms.tasks.Task
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Cross-check a short-lived Firebase custom token response against both
 * authorities: the signed-in Supabase user and the Firebase project actually
 * installed in this APK. Fail closed on missing project information, rather
 * than signing an unsuspecting user into a different Firebase project.
 * This checks response metadata, not the token's cryptographic signature:
 * Firebase Auth validates that signature when exchanging the custom token.
 */
internal fun isExpectedFirebaseIdentity(
    expectedUid: String,
    installedProjectId: String?,
    mintedUid: String,
    mintedProjectId: String?,
    customToken: String,
): Boolean =
    expectedUid.isNotBlank() &&
    mintedUid == expectedUid &&
    !installedProjectId.isNullOrBlank() &&
    mintedProjectId == installedProjectId &&
    customToken.isNotBlank()

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
        if (!isExpectedFirebaseIdentity(
                expectedUid = expectedUid,
                installedProjectId = environment.projectId,
                mintedUid = minted.uid,
                mintedProjectId = minted.projectId,
                customToken = minted.customToken,
            )
        ) return false

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
