package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.firebase.FirebaseAuthDataSource
import app.gagachat.core.firebase.FirebaseIdTokenProvider
import app.gagachat.core.firebase.FirebaseIdentityMapper
import app.gagachat.core.firebase.FirebaseTransportConfig
import app.gagachat.core.network.session.AuthSession
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Firebase-first authentication (migration spec §2, §3).
 *
 * Active only when `FIREBASE_AUTH_FIRST` is on (see `AuthRepositoryModule`); the
 * proven Supabase implementation ([DefaultAuthRepository]) stays the default and
 * remains reachable for the operations Firebase does not own (phone/OTP, legacy
 * recovery, server-side account deletion).
 *
 * The security-critical rule from the spec — *never link accounts solely because
 * someone submits a matching email* — is enforced structurally here:
 *
 *   • a session is only ever built from the canonical `gaga_user_id` **custom
 *     claim** the trusted backend injected into the ID token, never from an email;
 *   • an unmapped, *verified* account is given a **brand-new** GaGa id by the
 *     backend (which mints one without consulting email at all);
 *   • linking an *existing* account is never automatic — it requires the explicit
 *     [FirebaseIdentityMapper.link] call with proof of the legacy Supabase session.
 *
 * Session persistence is delegated to [DefaultAuthRepository.adopt] so both auth
 * paths share one [sessionFlow] and one encrypted [app.gagachat.core.network.session.SessionStore].
 */
@Singleton
class FirebaseFirstAuthRepository @Inject constructor(
    private val delegate: DefaultAuthRepository,
    private val firebaseAuth: FirebaseAuthDataSource,
    private val identityMapper: FirebaseIdentityMapper,
    private val idTokens: FirebaseIdTokenProvider,
    private val config: FirebaseTransportConfig,
    private val dispatchers: DispatcherProvider,
    private val logger: AppLogger,
) : AuthRepository {

    override val sessionFlow: StateFlow<AuthSession?> get() = delegate.sessionFlow

    override fun bootstrap(): AuthSession? = delegate.bootstrap()

    override fun isLoggedIn(): Boolean = delegate.isLoggedIn()

    override suspend fun signIn(
        email: String?,
        phone: String?,
        password: String,
    ): AppResult<AuthSession> {
        // Firebase owns email/password; phone-only logins stay on Supabase.
        if (!config.authFirst || email.isNullOrBlank()) return delegate.signIn(email, phone, password)
        return withContext(dispatchers.io) {
            when (val result = firebaseAuth.signIn(email, password)) {
                is AppResult.Success -> ensureSession(newAccount = false)
                is AppResult.Failure -> AppResult.Failure(result.error)
                AppResult.Loading -> AppResult.Loading
            }
        }
    }

    override suspend fun signUp(
        email: String?,
        phone: String?,
        password: String,
        displayName: String?,
    ): AppResult<AuthSession> {
        if (!config.authFirst || email.isNullOrBlank()) {
            return delegate.signUp(email, phone, password, displayName)
        }
        return withContext(dispatchers.io) {
            when (val result = firebaseAuth.register(email, password, displayName)) {
                // A fresh Firebase account is not verified yet, so this usually
                // resolves to a "verify your email" state rather than a session.
                is AppResult.Success -> ensureSession(newAccount = true)
                is AppResult.Failure -> AppResult.Failure(result.error)
                AppResult.Loading -> AppResult.Loading
            }
        }
    }

    override suspend fun validateAndRefresh(): AppResult<Unit> {
        if (!config.authFirst) return delegate.validateAndRefresh()
        return withContext(dispatchers.io) {
            val user = firebaseAuth.current()
            if (user == null) {
                // No Firebase identity → make sure no stale local session lingers.
                if (delegate.bootstrap() != null) delegate.clearSession()
                return@withContext AppResult.Success(Unit)
            }
            // Refresh the Firebase profile so a just-clicked verification link is seen.
            firebaseAuth.reload()
            when (val session = ensureSession(newAccount = null)) {
                is AppResult.Success -> AppResult.Success(Unit)
                // A not-yet-mapped account is not an error: the app stays on the
                // verification screen and retries on the next foreground.
                is AppResult.Failure ->
                    if (session.error is AppError.Forbidden) AppResult.Success(Unit) else AppResult.Failure(session.error)
                AppResult.Loading -> AppResult.Loading
            }
        }
    }

    override suspend fun sendOtp(email: String?, phone: String?): AppResult<Unit> =
        delegate.sendOtp(email, phone)

    override suspend fun verifyOtp(email: String?, phone: String?, token: String): AppResult<AuthSession> =
        delegate.verifyOtp(email, phone, token)

    override suspend fun reauthenticate(password: String): AppResult<Unit> {
        if (!config.authFirst) return delegate.reauthenticate(password)
        return withContext(dispatchers.io) {
            val email = firebaseAuth.current()?.email ?: return@withContext delegate.reauthenticate(password)
            when (val result = firebaseAuth.signIn(email, password)) {
                is AppResult.Success -> AppResult.Success(Unit)
                is AppResult.Failure -> AppResult.Failure(result.error)
                AppResult.Loading -> AppResult.Loading
            }
        }
    }

    override suspend fun changePassword(currentPassword: String, newPassword: String): AppResult<Unit> {
        if (!config.authFirst) return delegate.changePassword(currentPassword, newPassword)
        if (newPassword.length < 8) return AppResult.Failure(AppError.Validation("Use at least 8 characters"))
        return withContext(dispatchers.io) {
            when (val reauth = reauthenticate(currentPassword)) {
                is AppResult.Failure -> reauth
                else -> firebaseAuth.updatePassword(newPassword)
            }
        }
    }

    override suspend fun requestRecovery(email: String): AppResult<Unit> {
        if (!config.authFirst) return delegate.requestRecovery(email)
        // Firebase sends a signed reset link; no server-side "proof" round-trip.
        return firebaseAuth.sendPasswordReset(email)
    }

    override suspend fun completeRecovery(email: String, proof: String, password: String): AppResult<Unit> =
        delegate.completeRecovery(email, proof, password)

    override suspend fun signOut() {
        if (config.authFirst) runCatching { firebaseAuth.signOut() }
        delegate.signOut()
    }

    override suspend fun deleteAccount(): AppResult<Unit> {
        // Server-side deletion stays on the Supabase path (it owns the account
        // records); Firebase is only signed out afterwards.
        val result = delegate.deleteAccount()
        if (config.authFirst && result is AppResult.Success) runCatching { firebaseAuth.signOut() }
        return result
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /**
     * Builds (and adopts) the session for the currently signed-in Firebase user,
     * or returns a clear failure when the account is not ready for chat yet.
     */
    private suspend fun ensureSession(newAccount: Boolean?): AppResult<AuthSession> {
        val snapshot = firebaseAuth.current()
            ?: return AppResult.Failure(AppError.Unauthorized("Sign in again."))
        // Force a refresh so the freshly-injected `gaga_user_id` claim is present.
        val token = idTokens.fresh()
            ?: return AppResult.Failure(AppError.Unauthorized("Sign in again."))

        token.gagaUserId?.let { gagaId ->
            return delegate.adopt(
                session = AuthSession(
                    userId = gagaId,
                    accessToken = token.value,
                    // Firebase refreshes via the SDK, not a refresh token; the
                    // token-source seam routes refreshes to Firebase accordingly.
                    refreshToken = "",
                    expiresAtMillis = token.expiresAtMillis,
                    email = snapshot.email,
                    phone = null,
                    displayName = snapshot.displayName,
                ),
                newAccount = newAccount,
            )
        }

        // Unmapped. Minting a *new* GaGa id requires a verified email (the backend
        // enforces this too). We never link an existing account here — that needs
        // explicit proof of the legacy session via FirebaseIdentityMapper.link().
        if (!snapshot.emailVerified) {
            return AppResult.Failure(
                AppError.Forbidden("Verify your email address to finish setting up your account."),
            )
        }
        logger.i(TAG, "Mapping verified Firebase identity to a new GaGa account")
        return when (val mapped = identityMapper.register(snapshot.displayName, username = null)) {
            is AppResult.Success -> {
                val fresh = idTokens.fresh() ?: token
                delegate.adopt(
                    session = AuthSession(
                        userId = mapped.data.gagaUserId,
                        accessToken = fresh.value,
                        refreshToken = "",
                        expiresAtMillis = fresh.expiresAtMillis,
                        email = snapshot.email,
                        phone = null,
                        displayName = mapped.data.displayName ?: snapshot.displayName,
                    ),
                    newAccount = newAccount ?: true,
                )
            }
            is AppResult.Failure -> AppResult.Failure(mapped.error)
            AppResult.Loading -> AppResult.Loading
        }
    }

    private companion object {
        const val TAG = "FirebaseFirstAuthRepo"
    }
}
