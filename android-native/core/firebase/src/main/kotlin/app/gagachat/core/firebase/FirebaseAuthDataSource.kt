package app.gagachat.core.firebase

import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.FirebaseAuthUserCollisionException
import com.google.firebase.auth.FirebaseAuthWeakPasswordException
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.UserProfileChangeRequest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Firebase-first authentication data source (migration spec §2, §3).
 *
 * This is the *only* place the app talks to Firebase Authentication for the
 * email/password lifecycle. It deliberately returns the raw Firebase identity
 * ([Snapshot.uid]) and never invents a GaGa user id: turning a Firebase uid into
 * a GaGa user id is the job of the trusted [FirebaseIdentityMapper] (which calls
 * the `firebase-identity` backend). Keeping the two concerns apart is what makes
 * "never link accounts solely because someone submits a matching email" true —
 * this class never looks at email to decide identity.
 *
 * Every method is null-safe: when the app was built without `google-services.json`
 * [isAvailable] is `false` and each call fails cleanly instead of crashing, so a
 * misconfigured build degrades to "Firebase unavailable" rather than a hard stop.
 */
@Singleton
class FirebaseAuthDataSource @Inject constructor(
    private val environment: FirebaseEnvironment,
) {
    /** Immutable view of the signed-in Firebase user. */
    data class Snapshot(
        val uid: String,
        val email: String?,
        val emailVerified: Boolean,
        val displayName: String?,
    )

    val isAvailable: Boolean get() = environment.auth != null

    /** The currently signed-in Firebase user, or `null`. */
    fun current(): Snapshot? = environment.auth?.currentUser?.toSnapshot()

    /**
     * Creates a brand-new Firebase account and immediately sends the verification
     * email. A newly created account is **not** usable for chat until the email is
     * verified and the identity is mapped (enforced by the Firestore rules'
     * `ready()` gate).
     */
    suspend fun register(
        email: String,
        password: String,
        displayName: String?,
    ): AppResult<Snapshot> = runAuth {
        val auth = environment.auth ?: return@runAuth unavailable()
        val result = auth.createUserWithEmailAndPassword(email.trim(), password).awaitResult()
        val user = result.user ?: return@runAuth unavailable()
        if (!displayName.isNullOrBlank()) {
            runCatching {
                user.updateProfile(
                    UserProfileChangeRequest.Builder().setDisplayName(displayName.trim()).build(),
                ).awaitResult()
            }
        }
        runCatching { user.sendEmailVerification().awaitResult() }
        AppResult.Success(user.toSnapshot())
    }

    /** Signs in with email + password. */
    suspend fun signIn(email: String, password: String): AppResult<Snapshot> = runAuth {
        val auth = environment.auth ?: return@runAuth unavailable()
        val result = auth.signInWithEmailAndPassword(email.trim(), password).awaitResult()
        val user = result.user ?: return@runAuth unavailable()
        AppResult.Success(user.toSnapshot())
    }

    /** (Re)sends the email-verification link for the current user. */
    suspend fun sendVerificationEmail(): AppResult<Unit> = runAuth {
        val user = environment.auth?.currentUser ?: return@runAuth unauthorized()
        user.sendEmailVerification().awaitResult()
        AppResult.Success(Unit)
    }

    /**
     * Reloads the current user from the server so a just-clicked verification link
     * is reflected locally ([Snapshot.emailVerified] flips to `true`).
     */
    suspend fun reload(): AppResult<Snapshot> = runAuth {
        val user = environment.auth?.currentUser ?: return@runAuth unauthorized()
        user.reload().awaitResult()
        AppResult.Success(user.toSnapshot())
    }

    /** Sends a password-reset email. Never reveals whether the address exists. */
    suspend fun sendPasswordReset(email: String): AppResult<Unit> = runAuth {
        val auth = environment.auth ?: return@runAuth unavailable()
        auth.sendPasswordResetEmail(email.trim()).awaitResult()
        AppResult.Success(Unit)
    }

    /** Changes the password of the currently signed-in user. */
    suspend fun updatePassword(newPassword: String): AppResult<Unit> = runAuth {
        val user = environment.auth?.currentUser ?: return@runAuth unauthorized()
        user.updatePassword(newPassword).awaitResult()
        AppResult.Success(Unit)
    }

    /** Updates the display name on the Firebase profile. */
    suspend fun updateDisplayName(displayName: String): AppResult<Unit> = runAuth {
        val user = environment.auth?.currentUser ?: return@runAuth unauthorized()
        user.updateProfile(
            UserProfileChangeRequest.Builder().setDisplayName(displayName.trim()).build(),
        ).awaitResult()
        AppResult.Success(Unit)
    }

    fun signOut() {
        runCatching { environment.auth?.signOut() }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private inline fun <T> runAuth(block: () -> AppResult<T>): AppResult<T> = try {
        block()
    } catch (e: FirebaseAuthException) {
        AppResult.Failure(mapAuthError(e))
    } catch (t: Throwable) {
        if (t is kotlinx.coroutines.CancellationException) throw t
        AppResult.Failure(AppError.Unknown(t.message, t))
    }

    private fun unavailable(): AppResult<Nothing> =
        AppResult.Failure(AppError.Unknown("Firebase is not configured for this build."))

    private fun unauthorized(): AppResult<Nothing> =
        AppResult.Failure(AppError.Unauthorized("Sign in again."))

    private fun mapAuthError(e: FirebaseAuthException): AppError = when (e) {
        is FirebaseAuthWeakPasswordException -> AppError.Validation("Use a stronger password (at least 8 characters).")
        is FirebaseAuthUserCollisionException -> AppError.Validation("An account already exists for that email.")
        is FirebaseAuthInvalidUserException -> AppError.Unauthorized("No account matches those details.")
        is FirebaseAuthInvalidCredentialsException -> AppError.Unauthorized("Incorrect email or password.")
        else -> when (e.errorCode) {
            "ERROR_NETWORK_REQUEST_FAILED" -> AppError.Network("Check your connection and try again.", e)
            "ERROR_TOO_MANY_REQUESTS" -> AppError.Server(429, "Too many attempts. Try again shortly.", e)
            "ERROR_USER_DISABLED" -> AppError.Forbidden("This account has been disabled.", e)
            "ERROR_REQUIRES_RECENT_LOGIN" -> AppError.Unauthorized("Please sign in again to continue.", e)
            "ERROR_WRONG_PASSWORD", "ERROR_INVALID_CREDENTIAL" -> AppError.Unauthorized("Incorrect email or password.", e)
            "ERROR_INVALID_EMAIL" -> AppError.Validation("That email address looks invalid.")
            else -> AppError.Unknown(e.message, e)
        }
    }

    private fun FirebaseUser.toSnapshot() = Snapshot(
        uid = uid,
        email = email,
        emailVerified = isEmailVerified,
        displayName = displayName,
    )
}
