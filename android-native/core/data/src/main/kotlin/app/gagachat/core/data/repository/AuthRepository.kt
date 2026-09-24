package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.network.auth.SupabaseAuthApi
import app.gagachat.core.network.auth.SupabaseAuthApi.Companion.toSession
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
    fun isLoggedIn(): Boolean
}

@Singleton
class DefaultAuthRepository @Inject constructor(
    private val authApi: SupabaseAuthApi,
    private val sessionStore: SessionStore,
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
        runAuth { authApi.signInWithPassword(email, phone, password).toSession() }
    }

    override suspend fun signUp(
        email: String?,
        phone: String?,
        password: String,
        displayName: String?,
    ): AppResult<AuthSession> = withContext(dispatchers.io) {
        runAuth { authApi.signUpWithPassword(email, phone, password, displayName).toSession() }
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
        runAuth { authApi.verifyOtp(email, phone, token).toSession() }
    }

    override suspend fun signOut() {
        withContext(dispatchers.io) {
            val token = sessionStore.accessToken()
            if (token != null) runCatching { authApi.signOut(token) }
            clearLocalSession()
        }
    }

    override fun isLoggedIn(): Boolean = sessionStore.load() != null

    private suspend fun runAuth(block: suspend () -> AuthSession): AppResult<AuthSession> = try {
        val session = block()
        sessionStore.save(session)
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
