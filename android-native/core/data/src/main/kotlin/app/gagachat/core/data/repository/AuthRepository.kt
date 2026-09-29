package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.data.preferences.OnboardingPreferences
import app.gagachat.core.network.auth.SupabaseAuthApi
import app.gagachat.core.network.auth.toSession
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.session.AuthSession
import app.gagachat.core.network.session.SessionStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Authentication contract (PDF §3). Session bootstrap is deliberately split from
 * network validation so the app can render Home immediately from the local secure
 * session while refresh happens in the background.
 */
interface AuthRepository {
    val sessionFlow: StateFlow<AuthSession?>

    /** Fast, offline-safe: returns the persisted session without any network call. */
    fun bootstrap(): AuthSession?

    /** Background validation + token refresh. Clears session on 401/revoked. */
    suspend fun validateAndRefresh(): AppResult<Unit>

    suspend fun signIn(email: String?, phone: String?, password: String): AppResult<AuthSession>
    suspend fun signUp(
        email: String?,
        phone: String?,
        password: String,
        displayName: String?,
    ): AppResult<AuthSession>

    suspend fun sendOtp(email: String?, phone: String?): AppResult<Unit>
    suspend fun verifyOtp(email: String?, phone: String?, token: String): AppResult<AuthSession>

    suspend fun signOut()

    /**
     * Permanently deletes the signed-in user's account and all owned data
     * (Play Store requirement). On success the local session is cleared so the
     * app returns to the auth graph.
     */
    suspend fun deleteAccount(): AppResult<Unit>

    fun isLoggedIn(): Boolean
}

@Singleton
class DefaultAuthRepository @Inject constructor(
    private val authApi: SupabaseAuthApi,
    private val restApi: app.gagachat.core.network.rest.SupabaseRestApi,
    private val sessionStore: SessionStore,
    private val onboardingPreferences: OnboardingPreferences,
    private val timeProvider: TimeProvider,
    private val dispatchers: DispatcherProvider,
    private val logger: AppLogger,
) : AuthRepository {

    private val _sessionFlow = MutableStateFlow(sessionStore.load())
    override val sessionFlow: StateFlow<AuthSession?> = _sessionFlow.asStateFlow()

    override fun bootstrap(): AuthSession? = sessionStore.load().also { _sessionFlow.value = it }

    override suspend fun validateAndRefresh(): AppResult<Unit> = withContext(dispatchers.io) {
        val session = sessionStore.load() ?: return@withContext AppResult.Success(Unit)
        if (!session.needsRefresh(timeProvider.nowMillis())) return@withContext AppResult.Success(Unit)
        try {
            val tokens = authApi.refresh(session.refreshToken)
            sessionStore.updateTokens(
                accessToken = tokens.accessToken,
                refreshToken = tokens.refreshToken,
                expiresAtMillis = tokens.expiresAt ?: (timeProvider.nowMillis() + tokens.expiresIn * 1000),
            )
            _sessionFlow.value = sessionStore.load()
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            val error = ErrorMapper.map(t)
            if (error is AppError.Unauthorized) {
                // Expired/revoked session → clear protected session (PDF §3).
                logger.i(TAG, "Session revoked; clearing local session")
                clearLocalSession()
            }
            AppResult.Failure(error)
        }
    }

    override suspend fun signIn(
        email: String?,
        phone: String?,
        password: String,
    ): AppResult<AuthSession> = withContext(dispatchers.io) {
        // Password login ⇒ an existing account. Profile setup must NOT run again.
        runAuth(newAccount = false) { authApi.signInWithPassword(email, phone, password).toSession() }
    }

    override suspend fun signUp(
        email: String?,
        phone: String?,
        password: String,
        displayName: String?,
    ): AppResult<AuthSession> = withContext(dispatchers.io) {
        // Fresh sign-up ⇒ a brand-new account that must complete profile setup once.
        runAuth(newAccount = true) { authApi.signUpWithPassword(email, phone, password, displayName).toSession() }
    }

    override suspend fun sendOtp(email: String?, phone: String?): AppResult<Unit> =
        withContext(dispatchers.io) {
            try {
                authApi.sendOtp(email, phone)
                AppResult.Success(Unit)
            } catch (t: Throwable) {
                AppResult.Failure(ErrorMapper.map(t))
            }
        }

    override suspend fun verifyOtp(
        email: String?,
        phone: String?,
        token: String,
    ): AppResult<AuthSession> = withContext(dispatchers.io) {
        // OTP can be either a new sign-up confirmation or a passwordless login,
        // so leave the onboarding status unresolved (null) and let the gate
        // decide from the account's actual profile.
        runAuth(newAccount = null) { authApi.verifyOtp(email, phone, token).toSession() }
    }

    override suspend fun signOut() {
        withContext(dispatchers.io) {
            val token = sessionStore.accessToken()
            if (token != null) runCatching { authApi.signOut(token) }
            clearLocalSession()
        }
    }

    override suspend fun deleteAccount(): AppResult<Unit> = withContext(dispatchers.io) {
        try {
            val uid = sessionStore.userId()
            restApi.deleteMyAccount()
            if (uid != null) onboardingPreferences.clear(uid)
            clearLocalSession()
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override fun isLoggedIn(): Boolean = sessionStore.load() != null

    /**
     * Persists the session and records the onboarding intent for the account:
     *  - [newAccount] `true`  → brand-new sign-up; force profile setup once.
     *  - [newAccount] `false` → existing login; skip profile setup.
     *  - [newAccount] `null`  → unresolved (e.g. OTP); let the gate decide from
     *    the account's actual profile.
     */
    private suspend fun runAuth(
        newAccount: Boolean?,
        block: suspend () -> AuthSession,
    ): AppResult<AuthSession> = try {
        val session = block()
        sessionStore.save(session)
        when (newAccount) {
            true -> onboardingPreferences.markPending(session.userId)
            false -> onboardingPreferences.markCompleted(session.userId)
            null -> Unit
        }
        _sessionFlow.value = session
        AppResult.Success(session)
    } catch (t: Throwable) {
        AppResult.Failure(ErrorMapper.map(t))
    }

    private fun clearLocalSession() {
        sessionStore.clear()
        _sessionFlow.value = null
    }

    private companion object {
        const val TAG = "AuthRepository"
    }
}
