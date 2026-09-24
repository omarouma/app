package app.gagachat.core.network.session

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Encrypted-at-rest session storage (PDF §3, §11). Tokens are never written to
 * plain SharedPreferences, logs, or the local database.
 */
interface SessionStore {
    fun save(session: AuthSession)
    fun load(): AuthSession?
    fun updateTokens(accessToken: String, refreshToken: String, expiresAtMillis: Long)
    fun clear()
    fun accessToken(): String?
    fun userId(): String?
}

@Singleton
class EncryptedSessionStore @Inject constructor(
    @ApplicationContext context: Context,
) : SessionStore {

    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override fun save(session: AuthSession) {
        prefs.edit()
            .putString(KEY_USER_ID, session.userId)
            .putString(KEY_ACCESS, session.accessToken)
            .putString(KEY_REFRESH, session.refreshToken)
            .putLong(KEY_EXPIRES, session.expiresAtMillis)
            .putString(KEY_EMAIL, session.email)
            .putString(KEY_PHONE, session.phone)
            .putString(KEY_NAME, session.displayName)
            .apply()
    }

    override fun load(): AuthSession? {
        val userId = prefs.getString(KEY_USER_ID, null) ?: return null
        val access = prefs.getString(KEY_ACCESS, null) ?: return null
        val refresh = prefs.getString(KEY_REFRESH, null) ?: return null
        return AuthSession(
            userId = userId,
            accessToken = access,
            refreshToken = refresh,
            expiresAtMillis = prefs.getLong(KEY_EXPIRES, 0L),
            email = prefs.getString(KEY_EMAIL, null),
            phone = prefs.getString(KEY_PHONE, null),
            displayName = prefs.getString(KEY_NAME, null),
        )
    }

    override fun updateTokens(accessToken: String, refreshToken: String, expiresAtMillis: Long) {
        prefs.edit()
            .putString(KEY_ACCESS, accessToken)
            .putString(KEY_REFRESH, refreshToken)
            .putLong(KEY_EXPIRES, expiresAtMillis)
            .apply()
    }

    override fun clear() {
        prefs.edit().clear().apply()
    }

    override fun accessToken(): String? = prefs.getString(KEY_ACCESS, null)

    override fun userId(): String? = prefs.getString(KEY_USER_ID, null)

    private companion object {
        const val PREFS_NAME = "gaga_secure_session"
        const val KEY_USER_ID = "user_id"
        const val KEY_ACCESS = "access_token"
        const val KEY_REFRESH = "refresh_token"
        const val KEY_EXPIRES = "expires_at"
        const val KEY_EMAIL = "email"
        const val KEY_PHONE = "phone"
        const val KEY_NAME = "display_name"
    }
}
