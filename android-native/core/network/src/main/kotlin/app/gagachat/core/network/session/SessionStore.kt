package app.gagachat.core.network.session

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import java.security.KeyStore
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

/**
 * Keystore-backed session store that is resilient to the single most common
 * real-world auth failure: a corrupted/invalidated [EncryptedSharedPreferences]
 * file (after a device-to-device restore, a lock-screen change that invalidates
 * the Android Keystore key, or an OEM ROM quirk). Historically this threw out of
 * the `lazy` initialiser, which crashed the repository constructor on cold start
 * and made "log in" appear completely broken.
 *
 * Every read/write now self-heals: if the encrypted store cannot be opened we
 * wipe the keyset + master key and recreate it, so the user simply has to sign
 * in again instead of hitting a hard crash.
 */
@Singleton
class EncryptedSessionStore @Inject constructor(
    @ApplicationContext private val context: Context,
) : SessionStore {

    private val prefs: SharedPreferences by lazy { openOrRebuild() }

    /** Opens the encrypted store, rebuilding it once if the keyset is unusable. */
    private fun openOrRebuild(): SharedPreferences = try {
        buildEncryptedPrefs()
    } catch (t: Throwable) {
        Log.w(TAG, "Encrypted session store unusable; rebuilding from scratch", t)
        resetStore()
        buildEncryptedPrefs()
    }

    private fun buildEncryptedPrefs(): SharedPreferences {
        // MasterKey always uses MasterKey.DEFAULT_MASTER_KEY_ALIAS as its alias,
        // which is what resetStore() deletes when rebuilding.
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    /** Deletes the encrypted prefs file and the backing Keystore master key. */
    private fun resetStore() {
        runCatching { context.deleteSharedPreferences(PREFS_NAME) }
        runCatching {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            if (keyStore.containsAlias(MASTER_KEY_ALIAS)) {
                keyStore.deleteEntry(MASTER_KEY_ALIAS)
            }
        }
    }

    override fun save(session: AuthSession) {
        runCatching {
            prefs.edit()
                .putString(KEY_USER_ID, session.userId)
                .putString(KEY_ACCESS, session.accessToken)
                .putString(KEY_REFRESH, session.refreshToken)
                .putLong(KEY_EXPIRES, session.expiresAtMillis)
                .putString(KEY_EMAIL, session.email)
                .putString(KEY_PHONE, session.phone)
                .putString(KEY_NAME, session.displayName)
                .apply()
        }.onFailure { Log.w(TAG, "Failed to persist session", it) }
    }

    override fun load(): AuthSession? = runCatching {
        val userId = prefs.getString(KEY_USER_ID, null) ?: return@runCatching null
        val access = prefs.getString(KEY_ACCESS, null) ?: return@runCatching null
        val refresh = prefs.getString(KEY_REFRESH, null) ?: return@runCatching null
        AuthSession(
            userId = userId,
            accessToken = access,
            refreshToken = refresh,
            expiresAtMillis = prefs.getLong(KEY_EXPIRES, 0L),
            email = prefs.getString(KEY_EMAIL, null),
            phone = prefs.getString(KEY_PHONE, null),
            displayName = prefs.getString(KEY_NAME, null),
        )
    }.getOrElse { t ->
        // A read failure means the store is corrupt — reset it so the next launch
        // (and the next sign-in) starts clean instead of crashing again.
        Log.w(TAG, "Failed to read session; resetting store", t)
        runCatching { resetStore() }
        null
    }

    override fun updateTokens(accessToken: String, refreshToken: String, expiresAtMillis: Long) {
        runCatching {
            prefs.edit()
                .putString(KEY_ACCESS, accessToken)
                .putString(KEY_REFRESH, refreshToken)
                .putLong(KEY_EXPIRES, expiresAtMillis)
                .apply()
        }.onFailure { Log.w(TAG, "Failed to update tokens", it) }
    }

    override fun clear() {
        runCatching { prefs.edit().clear().apply() }
            .onFailure { Log.w(TAG, "Failed to clear session", it) }
    }

    override fun accessToken(): String? = runCatching { prefs.getString(KEY_ACCESS, null) }.getOrNull()

    override fun userId(): String? = runCatching { prefs.getString(KEY_USER_ID, null) }.getOrNull()

    private companion object {
        const val TAG = "SessionStore"
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val MASTER_KEY_ALIAS = MasterKey.DEFAULT_MASTER_KEY_ALIAS
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
